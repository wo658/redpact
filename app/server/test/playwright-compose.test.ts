import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createCaptureBaselineCleanup } from "../src/adapters/playwright/baseline.js"
import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createCaptureStore } from "../src/adapters/storage/captures.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"
import { createCaptureWorkflow } from "../src/workflows/capture-ui.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createCaptures } from "../src/workflows/playwright.js"
import { createRuns } from "../src/workflows/runs.js"
import { createStopEnvironment } from "../src/workflows/stop-environment.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

test.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")(
  "Compose에서 현재 소스만 캡처하고 워크트리 환경과 초안을 정리해도 증거를 보존한다",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "capture-compose-")),
      project = join(root, "project"),
      data = join(root, "runtime"),
      ownerId = randomUUID()
    await mkdir(join(project, ".redpact"), { recursive: true })
    await mkdir(join(project, "ui-tests/worktree/captures"), { recursive: true })
    await writeFile(join(project, ".gitignore"), "ui-tests/worktree/\n")
    await writeFile(
      join(project, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        playwright: {
          targets: {
            captures: {
              scope: "worktree",
              purpose: "capture",
              testMatch: ["worktree/captures/*.spec.ts"],
            },
          },
          service: "app",
          port: 3000,
        },
      }),
    )
    await writeFile(
      join(project, "compose.yaml"),
      `services:
  app:
    build: .
    healthcheck:
      test: [CMD, node, -e, "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1))"]
      interval: 1s
      timeout: 2s
      retries: 30
`,
    )
    await writeFile(
      join(project, "Dockerfile"),
      'FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY server.cjs page.html ./\nCMD ["node","server.cjs"]\n',
    )
    await writeFile(
      join(project, "server.cjs"),
      "require('http').createServer((q,s)=>s.end(require('fs').readFileSync('page.html'))).listen(3000,'127.0.0.1')",
    )
    await writeFile(join(project, ".dockerignore"), "ui-tests\nnoise.txt\n.git\n")
    await writeFile(join(project, "page.html"), "<h1>Before</h1>")
    await writeFile(
      join(project, "ui-tests/worktree/captures", "page.spec.ts"),
      `import {test,expect} from '@playwright/test';test('실제 버전의 화면',async({page},info)=>{await page.goto('/');await expect(page.getByRole('heading')).toHaveText('After');await info.attach('화면',{body:await page.screenshot(),contentType:'image/png'})})`,
    )
    const git = async (...args: string[]) =>
      (await execa("git", ["-C", project, "-c", "core.hooksPath=/dev/null", ...args])).stdout.trim()
    await git("init", "-b", "main")
    await git("config", "user.name", "Test")
    await git("config", "user.email", "test@example.invalid")
    await git("add", ".")
    await git("commit", "-m", "before")
    await git("switch", "-c", "feature")
    await writeFile(join(project, "page.html"), "<h1>After</h1>")
    const storage = openStore(data),
      worktrees = createTestWorktrees({
        store: storage.store,
        git: createGitAdapter(),
        settings: createSettingsService,
      })
    const connected = await worktrees.connect(project),
      worktree = await worktrees.ensure(connected.id, project)
    await worktrees.projects.update(connected.id, { mainBranch: "main", hideMerged: false })
    const environments = createEnvironments({
      store: storage.store,
      worktrees,
      ownerId,
      adapter: createComposeAdapter(data),
    })
    const captures = createCaptures(createCaptureStore(data)),
      runner = createCaptureRunner(data, ownerId)
    const stopEnvironment = createStopEnvironment({
      environments,
      runs: createRuns({ store: storage.store, runner: createVitestRunner(data) }),
    })
    const workflow = createCaptureWorkflow({
      captures,
      runner,
      baseline: createCaptureBaselineCleanup(data),
      worktrees,
      environments,
      stopEnvironment,
    })
    try {
      const run = await workflow.start(worktree.id, { services: ["app"], select: {} })
      await expect.poll(() => captures.get(run.id).state, { timeout: 150000 }).toBe("finished")
      const result = captures.get(run.id)
      expect(result.error).toBeUndefined()
      expect(result.scope).toBe("worktree")
      expect(result.before.environmentId).toBeUndefined()
      expect(result.before.cases).toEqual([])
      expect(result.cleanupError).toBeUndefined()
      expect(result.baseRevision).toBeUndefined()
      expect(result.after.outcome).toBe("passed")
      expect(result.appDigest).toBe(result.after.inputDigest)
      await writeFile(join(project, "noise.txt"), "ignored source change")
      expect((await workflow.inspect(worktree.id)).inputDigest).toBe(result.appDigest)
      await writeFile(join(project, "page.html"), "<h1>Edited after capture</h1>")
      expect((await workflow.inspect(worktree.id)).inputDigest).not.toBe(result.appDigest)
      const after = result.after.cases[0].artifacts.find((a) => a.name === "화면")!
      expect((await captures.artifact(run.id, "after", after.id)).data.length).toBe(after.bytes)
      expect(environments.get(result.after.environmentId!).state).toBe("stopped")
      await workflow.cleanupWorktree(worktree.id)
      expect(await git("status", "--short", "--ignored", "ui-tests/worktree")).toBe("")
      expect(await captures.source(run.id, "worktree/captures/page.spec.ts")).toContain(
        "toHaveText('After')",
      )
      expect((await captures.artifact(run.id, "after", after.id)).data.length).toBe(after.bytes)
      expect(await git("worktree", "list", "--porcelain")).not.toContain("playwright-baselines")
    } finally {
      await workflow.close()
      await stopEnvironment.cleanupTemporary()
      await environments.close()
      storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  180000,
)
