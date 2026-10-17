import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import {
  inspectContainer,
  inspectImage,
  removeImage,
  runtimeClient,
} from "../src/adapters/environment/runtime.js"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import type { Environment } from "../src/core/types/environment.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "수동 환경 반복 시작과 종료는 전용 이미지·볼륨·네트워크·소스를 완전히 제거한다",
  async () => {
    const socket = createServer()
    await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve))
    const port = (socket.address() as { port: number }).port
    await new Promise<void>((resolve, reject) =>
      socket.close((error) => (error ? reject(error) : resolve())),
    )
    const root = await mkdtemp(join(tmpdir(), "redpact-manual-docker-"))
    const sharedImage = `redpact-shared-${randomUUID()}:latest`
    const sharedVolume = `redpact-external-${randomUUID()}`
    await execa("docker", ["tag", "node:24-alpine", sharedImage])
    await execa("docker", ["volume", "create", sharedVolume])
    const sharedImageId = (await inspectImage(sharedImage))?.Id
    const project = join(root, "project")
    const data = join(root, "data")
    await mkdir(join(project, ".redpact"), { recursive: true })
    await writeFile(
      join(project, "Dockerfile"),
      "FROM node:24-alpine\nRUN mkdir /app\nCMD [\"node\", \"-e\", \"require('http').createServer((q,s)=>s.end('manual')).listen(3000,'0.0.0.0')\"]\n",
    )
    await writeFile(
      join(project, "compose.yaml"),
      'services:\n  app:\n    build: .\n    image: redpact-shared-must-not-overwrite:latest\n    ports: ["3000"]\n    volumes: ["data:/data", "/anonymous", "shared:/shared"]\n    healthcheck:\n      test: [CMD, node, -e, "fetch(\'http://localhost:3000\').then(r=>{if(!r.ok)process.exit(1)})"]\n      interval: 1s\n      timeout: 2s\n      retries: 20\nvolumes:\n  data:\n    name: redpact-external-name-must-not-reuse\n  shared:\n    external: true\n    name: SHARED_VOLUME\n'
        .replace("SHARED_VOLUME", sharedVolume)
        .replace("redpact-shared-must-not-overwrite:latest", sharedImage),
    )
    await writeFile(
      join(project, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        services: ["app"],
        dependencies: {
          inspection: {
            kind: "isolated",
            services: ["app"],
            hostPorts: [{ service: "app", target: 3000, published: port }],
          },
        },
      }),
    )
    const storage = openStore(data)
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const connected = await worktrees.connect(project)
    const worktree = (await worktrees.listWorktrees(connected.id))[0]
    const adapter = createComposeAdapter(data)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      adapter,
      ownerId: randomUUID(),
    })
    const { selection } = await worktrees.getIntegrationDefaults(connected.id)
    const settings = await (await worktrees.resolve(worktree.id)).settings.read(selection)
    const records: string[] = []
    console.log(
      "Shared Docker disk baseline",
      (await execa("docker", ["system", "df", "--format", "{{json .}}"], { timeout: 60000 }))
        .stdout,
    )
    try {
      for (let iteration = 0; iteration < 2; iteration++) {
        const record = await environments.prepare(
          worktree.id,
          randomUUID(),
          settings.digest!,
          selection,
          null,
          undefined,
          "main",
        )
        records.push(record.id)
        await environments.idle()
        const ready = environments.get(record.id)
        if (ready.state !== "ready") {
          console.error(
            await readFile(join(data, "environments", record.id, "preparation.log"), "utf8"),
          )
        }
        expect(ready.state).toBe("ready")
        const endpoint = ready.endpoints["app:3000"]
        expect(endpoint.port).toBe(port)
        expect(await (await fetch(`http://${endpoint.host}:${endpoint.port}`)).text()).toBe(
          "manual",
        )
        if (iteration === 0) {
          for (const scope of ["worktree", "main"] as const) {
            const id = randomUUID()
            let parallel: Environment = {
              ...record,
              id,
              requestId: randomUUID(),
              projectName: `redpact-${record.ownerId}-${id}`,
              manualScope: scope,
            }
            try {
              const preparation = adapter.prepare(
                parallel,
                new AbortController().signal,
                (change) => {
                  parallel = { ...parallel, ...change }
                },
              )
              if (scope === "main") {
                await expect(preparation).rejects.toThrow(/Fixed host port conflict/)
              } else {
                await preparation
                expect(parallel.endpoints["app:3000"].port).not.toBe(port)
                const endpoint = parallel.endpoints["app:3000"]
                expect(await (await fetch(`http://${endpoint.host}:${endpoint.port}`)).text()).toBe(
                  "manual",
                )
              }
            } finally {
              await adapter.stop(parallel)
              expect((await adapter.inspect(parallel)).resources).toEqual([])
              expect(await inspectImage(`${parallel.projectName}-app`)).toBeNull()
            }
            expect(await (await fetch(`http://${endpoint.host}:${endpoint.port}`)).text()).toBe(
              "manual",
            )
          }
        }
        const volumeNames = (
          await Promise.all(
            ready.resources
              .filter((resource) => resource.kind === "container")
              .map(async (resource) => (await inspectContainer(resource.id)).Mounts ?? []),
          )
        )
          .flat()
          .filter((mount) => mount.Type === "volume" && mount.Destination !== "/shared")
          .map((mount) => mount.Name!)
        expect(volumeNames).toHaveLength(2)
        const image = `${record.projectName}-app`
        const built = await inspectImage(image)
        expect(built).not.toBeNull()
        console.log("Owned image bytes before teardown", built?.Size)
        await environments.beginStop(record.id)
        await environments.completeStop(record.id)
        expect(environments.get(record.id).state).toBe("stopped")
        expect((await adapter.inspect(ready)).resources).toEqual([])
        expect(await inspectImage(image)).toBeNull()
        expect((await inspectImage(sharedImage))?.Id).toBe(sharedImageId)
        console.log(
          "Shared Docker disk after teardown",
          iteration,
          (await execa("docker", ["system", "df", "--format", "{{json .}}"], { timeout: 60000 }))
            .stdout,
        )
        await expect(
          readFile(join(data, "environments", record.id, "source", "Dockerfile")),
        ).rejects.toMatchObject({ code: "ENOENT" })
        expect(
          await readFile(join(data, "environments", record.id, "services.log"), "utf8"),
        ).toBeTypeOf("string")
        const client = await runtimeClient()
        expect((await client.volume.inspect(sharedVolume)).Name).toBe(sharedVolume)
        for (const name of volumeNames) {
          await expect(client.volume.inspect(name)).rejects.toMatchObject({ statusCode: 404 })
        }
        await expect(
          readFile(join(data, "environments", record.id, "runtime", ".redpact-resolved.yaml")),
        ).rejects.toMatchObject({ code: "ENOENT" })
        expect(
          await client.volume.list({ filters: { label: [`io.redpact.environment=${record.id}`] } }),
        ).toEqual([])
      }
    } finally {
      for (const id of records) {
        await environments.beginStop(id)
        await environments.completeStop(id)
      }
      await environments.close()
      storage.close()
      await removeImage(sharedImage)
      await (await runtimeClient()).volume.remove(sharedVolume)
      await rm(root, { recursive: true, force: true })
    }
  },
  180000,
)
