import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { getContainerRuntimeClient } from "testcontainers"
import { expect, test } from "vitest"
import { startComposeSession } from "../src/adapters/environment/compose-session.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "Compose 의존 서비스 조기 종료 로그가 자동 삭제 전에 보존되고 호출자에게 전달된다",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "compose-failure-evidence-"))
    const projectName = `redpact-logs-${randomUUID()}`
    const marker = "ISSUE20_EARLY_EXIT_DIAGNOSTIC"
    await writeFile(
      join(directory, "compose.yaml"),
      `services:
  init:
    image: postgres:17-alpine
    entrypoint: [sh, -c, 'echo ${marker}; echo ${marker}_STDERR >&2; exit 7']
  app:
    image: postgres:17-alpine
    entrypoint: [sleep, '3600']
    depends_on:
      init:
        condition: service_completed_successfully
`,
    )
    const session = startComposeSession({
      executable: process.execPath,
      args: [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("../src/adapters/environment/compose-worker.ts", import.meta.url)),
      ],
      cwd: directory,
      env: process.env,
      spec: {
        temporary: true,
        runnerName: `${projectName}-runner`,
        networkLabels: {},
        directory,
        files: ["compose.yaml"],
        services: ["app"],
        profiles: [],
        projectName,
        timeoutMs: 30000,
      },
      signal: AbortSignal.timeout(60000),
      preparationLog: join(directory, "preparation.log"),
      servicesLog: join(directory, "services.log"),
      redact: (value) => value,
      redactions: ["s".repeat(100)],
    })
    try {
      await expect(session.ready).rejects.toThrow(marker)
      await session.stop(30000)
      expect(await readFile(join(directory, "services.log"), "utf8")).toContain(`${marker}_STDERR`)
      const client = await getContainerRuntimeClient()
      expect(
        await client.container.list({
          all: true,
          filters: { label: [`com.docker.compose.project=${projectName}`] },
        }),
      ).toEqual([])
      expect(await client.network.list({ filters: { name: [`${projectName}-runner`] } })).toEqual(
        [],
      )
    } finally {
      if (session.alive()) {
        await session.stop(30000)
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
  90000,
)

import { mkdir } from "node:fs/promises"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

dockerTest.each(["main", "worktree"] as const)(
  "실제 Docker 수동 환경 %s의 종료 수명을 보존한다",
  async (scope) => {
    const root = await mkdtemp(join(tmpdir(), "compose-shutdown-"))
    const project = join(root, "project")
    const data = join(root, "data")
    await mkdir(join(project, ".redpact"), { recursive: true })
    await writeFile(
      join(project, "compose.yaml"),
      "services:\n  app:\n    image: postgres:17-alpine\n    entrypoint: [sleep, '3600']\n",
    )
    await writeFile(
      join(project, ".redpact/settings.json"),
      JSON.stringify({ composeFiles: ["compose.yaml"], services: ["app"] }),
    )
    const storage = openStore(data)
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const connected = await worktrees.connect(project)
    const [worktree] = await worktrees.listWorktrees(connected.id)
    const adapter = createComposeAdapter(data)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      adapter,
      ownerId: randomUUID(),
    })
    const { selection } = await worktrees.getIntegrationDefaults(connected.id)
    const validation = await (await worktrees.resolve(worktree.id)).settings.read(selection)
    if (!validation.digest) {
      throw new Error("Fixture settings unavailable")
    }
    const record = await environments.prepare(
      worktree.id,
      randomUUID(),
      validation.digest,
      selection,
      null,
      undefined,
      scope,
    )
    try {
      await environments.idle()
      expect(environments.get(record.id).state).toBe("ready")
      await environments.close()
      const after = environments.get(record.id)
      if (scope === "main") {
        expect(after.state).toBe("ready")
        expect((await adapter.inspect(after)).healthy).toBe(true)
      } else {
        expect(after.state).toBe("stopped")
        expect((await adapter.inspect(after)).resources).toEqual([])
      }
    } finally {
      await adapter.stop(environments.get(record.id))
      await adapter.close?.()
      storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)
