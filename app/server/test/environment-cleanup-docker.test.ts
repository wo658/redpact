import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import type { Environment } from "../src/core/types/environment.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestExecution } from "./helpers/execution.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

const dockerTest = process.env.REDPACT_DOCKER_TESTS === "1" ? test : test.skip

dockerTest(
  "반복 실행은 명시적 빌드 태그를 남기지 않고 이름 있는 볼륨과 익명 볼륨을 함께 제거한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "redpact-cleanup-docker-"))
    const project = join(root, "project")
    const data = join(root, "data")
    const namedImage = `redpact-cleanup-preserved-${randomUUID()}`
    const extraTag = `redpact-cleanup-extra-${randomUUID()}`
    await execa("docker", ["pull", "alpine:3.21"])
    await execa("docker", ["tag", "alpine:3.21", namedImage])
    const originalImage = (
      await execa("docker", ["image", "inspect", "--format", "{{.Id}}", namedImage])
    ).stdout.trim()
    await mkdir(join(project, ".redpact"), { recursive: true })
    await writeFile(
      join(project, "Dockerfile"),
      `FROM alpine:3.21\nLABEL redpact.cleanup-test="${randomUUID()}"\n`,
    )
    await writeFile(
      join(project, "named.Dockerfile"),
      `FROM alpine:3.21\nLABEL redpact.named-test="${randomUUID()}"\n`,
    )
    await writeFile(
      join(project, "compose.yaml"),
      `services:
  app:
    build: .
    command: [sh, -c, "trap 'echo shutdown-output; exit 0' TERM; while true; do sleep 1; done"]
    volumes: ["data:/state", "/anonymous"]
    healthcheck:
      test: [CMD, "true"]
      interval: 1s
      timeout: 1s
      retries: 30
  named:
    build:
      context: .
      dockerfile: named.Dockerfile
      tags: ["${extraTag}"]
    image: ${namedImage}
    command: [sh, -c, "sleep 300"]
    healthcheck:
      test: [CMD, "true"]
      interval: 1s
      timeout: 1s
      retries: 30
  excluded:
    image: alpine:3.21
    environment:
      REQUIRED: "\${UNSELECTED_SECRET:?must not be needed for cleanup}"
volumes:
  data: {}
`,
    )
    await writeFile(
      join(project, ".redpact/settings.json"),
      JSON.stringify({ composeFiles: ["compose.yaml"], services: ["app", "named"] }),
    )
    const settings = createSettingsService(project)
    const storage = openStore(data)
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const p = await worktrees.connect(project)
    const worktree = await worktrees.ensure(p.id, project)
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      ownerId: randomUUID(),
      adapter: createComposeAdapter(data),
    })
    const captured: Environment[] = []
    async function writeRuntimeData(environment: Environment) {
      captured.push(environment)
      const container = environment.resources.find(
        (resource) => resource.kind === "container" && resource.service === "app",
      )!
      await execa("docker", [
        "exec",
        container.id,
        "sh",
        "-c",
        "echo test-data >/state/value; echo anonymous-data >/anonymous/value; echo final-stdout >/proc/1/fd/1; echo final-stderr >/proc/1/fd/2",
      ])
    }
    const runs = createTestExecution({
      store: storage.store,
      worktrees,
      environments,
      scheduler: createScheduler(),
      settings,
      runner: {
        version: "cleanup-probe",
        execute: async () => {
          await writeRuntimeData(
            environments.list(worktree.id).find((item) => item.state === "in_use")!,
          )
          return { outcome: "passed", cases: [], errors: [] }
        },
      },
    })
    const submissions = createSubmissions({
      store: storage.store,
      worktrees,
      parse: parseSource,
      runnerVersion: "cleanup-probe",
    })
    const work = await submissions.createWork("Verify lifecycle cleanup", worktree.id)
    const submission = await submissions.submitForWork(work.id, [
      {
        path: "cleanup.test.ts",
        source: "import {test} from 'vitest'; test('cleanup probe',()=>{})",
      },
    ])
    const selection = { services: ["app", "named"], select: {} }
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const run = await runs.start(submission.id, selection)
        await expect.poll(() => runs.get(run.id).state, { timeout: 90000 }).toBe("finished")
        expect(runs.get(run.id).result?.outcome).toBe("passed")
        await expect
          .poll(() => environments.get(runs.get(run.id).environmentId!).state, { timeout: 30000 })
          .toBe("stopped")
      }
      for (const environment of captured) {
        expect(environments.get(environment.id).state).toBe("stopped")
        expect(
          (
            await execa("docker", [
              "ps",
              "-aq",
              "--filter",
              `label=com.docker.compose.project=${environment.projectName}`,
            ])
          ).stdout,
        ).toBe("")
        for (const resource of environment.resources.filter((item) => item.kind !== "container")) {
          expect(
            (await execa("docker", [resource.kind, "inspect", resource.id], { reject: false }))
              .exitCode,
          ).not.toBe(0)
        }
        for (const resource of environment.resources.filter(
          (item) => item.kind === "container" && item.image,
        )) {
          expect(
            (await execa("docker", ["image", "inspect", resource.image!], { reject: false }))
              .exitCode,
          ).not.toBe(0)
        }
        const directory = join(data, "environments", environment.id)
        await expect(access(join(directory, "source"))).rejects.toThrow()
        const log = await readFile(join(directory, "services.log"), "utf8")
        expect(log).toContain("final-stdout")
        expect(log).toContain("final-stderr")
        expect(log).toContain("shutdown-output")
        await expect(access(join(directory, "preparation.log"))).resolves.toBeUndefined()
      }
      expect(captured).toHaveLength(2)
      expect(
        (
          await execa("docker", ["image", "inspect", "--format", "{{.Id}}", namedImage])
        ).stdout.trim(),
      ).toBe(originalImage)
      expect(
        (await execa("docker", ["image", "inspect", extraTag], { reject: false })).exitCode,
      ).not.toBe(0)
    } finally {
      await runs.close()
      for (const environment of environments.list(worktree.id)) {
        await runs.stopEnvironment(environment.id)
      }
      await runs.stopEnvironment.idle()
      await environments.close()
      storage.close()
      await execa("docker", ["image", "rm", namedImage, extraTag], { reject: false })
      await rm(root, { recursive: true, force: true })
    }
  },
  180000,
)
