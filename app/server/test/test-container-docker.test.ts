import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { readProjectEntry } from "../src/adapters/project-files.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createStopEnvironment } from "../src/workflows/stop-environment.js"
import { createTestContainer } from "../src/workflows/test-container.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip
dockerTest.each(["0.0.0.0", "127.0.0.1"])(
  "컨테이너 바인딩 %s의 호스트 접속 가능 여부를 확인하고 재실행한다",
  async (host) => {
    const root = await mkdtemp(join(tmpdir(), "redpact-manual-docker-"))
    const projectRoot = join(root, "project")
    const dataRoot = join(root, "data")
    await mkdir(join(projectRoot, ".redpact"), { recursive: true })
    await writeFile(
      join(projectRoot, "Dockerfile"),
      'FROM node:24-alpine\nWORKDIR /app\nCOPY . ./\nCMD ["node", "server.mjs"]\n',
    )
    await writeFile(
      join(projectRoot, "server.mjs"),
      `import http from 'node:http'; import { readFileSync } from 'node:fs'; http.createServer((req, res) => res.end(readFileSync('index.html'))).listen(8080, '${host}');`,
    )
    await writeFile(join(projectRoot, "index.html"), "original")
    await writeFile(join(projectRoot, ".dockerignore"), "arbitrary-cache\n")
    await mkdir(join(projectRoot, "arbitrary-cache"))
    await writeFile(join(projectRoot, "arbitrary-cache/noise"), "ignored")
    await writeFile(
      join(projectRoot, "compose.yaml"),
      'services:\n  app:\n    build: .\n    ports: ["8080"]\n    healthcheck:\n      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080"]\n      interval: 1s\n      timeout: 2s\n      retries: 30\n',
    )
    await writeFile(
      join(projectRoot, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        tests: { env: { APP_URL: { service: "app", port: 8080, scheme: "http" } } },
      }),
    )
    await symlink("/missing-cache-target", join(projectRoot, "unrelated-cache-link"))
    const storage = openStore(dataRoot)
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const project = await worktrees.connect(projectRoot)
    const adapter = createComposeAdapter(dataRoot)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      ownerId: randomUUID(),
      adapter,
    })
    const stopEnvironment = createStopEnvironment({
      environments,
      runs: { unfinished: () => [], cancelAndWait: async () => {} } as never,
    })
    const service = createTestContainer({
      readFile: readProjectEntry,
      worktrees,
      projects: worktrees.projects,
      environments,
      stopEnvironment,
      fingerprint: adapter.fingerprint,
    })
    async function ready() {
      await environments.idle()
      const state = await service.inspect(project.id)
      if (state.environment?.state !== "ready") {
        const details = await execa("docker", [
          "ps",
          "-a",
          "--filter",
          `label=com.docker.compose.project=${state.environment!.projectName}`,
          "--format",
          "{{.Status}} {{.Names}}",
        ])
        throw new Error(
          details.stdout +
            "\n" +
            (await readFile(
              join(dataRoot, "environments", state.environment!.id, "preparation.log"),
              "utf8",
            )),
        )
      }
      const endpoint = state.environment.endpoints["app:8080"]
      return { record: state.environment, url: `http://${endpoint.host}:${endpoint.port}` }
    }
    try {
      await expect(service.start(project.id)).resolves.toMatchObject({
        environment: { state: "preparing" },
      })
      if (host === "127.0.0.1") {
        await environments.idle()
        const state = await service.inspect(project.id)
        expect(state.environment?.state).toBe("failed")
        const log = await readFile(
          join(dataRoot, "environments", state.environment!.id, "preparation.log"),
          "utf8",
        )
        expect(log).toContain("app:8080")
        expect(log).toContain("not reachable from the host")
        return
      }
      const first = await ready()
      expect(await (await fetch(first.url)).text()).toBe("original")
      await writeFile(join(projectRoot, "arbitrary-cache/noise"), "changed")
      expect((await service.inspect(project.id)).changed).toBe(false)
      const container = first.record.resources.find((resource) => resource.kind === "container")!
      const copied = await execa("docker", [
        "exec",
        container.id,
        "sh",
        "-c",
        "test ! -e /app/arbitrary-cache && readlink /app/unrelated-cache-link",
      ])
      expect(copied.stdout).toBe("/missing-cache-target")
      await writeFile(join(projectRoot, "index.html"), "edited")
      expect((await service.inspect(project.id)).changed).toBe(true)
      expect(await (await fetch(first.url)).text()).toBe("original")
      await service.restart(project.id)
      const second = await ready()
      expect(second.record.id).not.toBe(first.record.id)
      expect(await (await fetch(second.url)).text()).toBe("edited")
      expect(environments.get(first.record.id).state).toBe("stopped")
      expect((await adapter.inspect(first.record)).resources).toEqual([])
      await service.close()
      expect((await adapter.inspect(second.record)).resources).toEqual([])
    } finally {
      await service.close()
      await environments.close()
      storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  120000,
)
