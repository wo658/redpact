import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestApp, createTestExecution } from "./helpers/execution.js"
import { managementHttp } from "./helpers/management-http.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

let root: string
let storage: ReturnType<typeof openStore>
let app: ReturnType<typeof createTestApp>
let runs: ReturnType<typeof createTestExecution>
let environments: ReturnType<typeof createEnvironments>
let executions = 0
let preparations = 0
let preparation: (signal: AbortSignal) => Promise<void>
const _selection = { services: ["app"], select: {} }
const source = 'import { test, expect } from "vitest"; test("observed", () => expect(1).toBe(1))'
async function mcp(name: string, args: object) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      Host: "localhost",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  })
  return (await response.json()).result
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-mcp-files-"))
  await mkdir(join(root, ".redpact"))
  await mkdir(join(root, "tests"))
  await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(root, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      tests: { directory: "tests" },
      services: ["app"],
    }),
  )
  await writeFile(join(root, "tests/example.test.ts"), source)
  executions = 0
  preparations = 0
  preparation = async () => {}
  storage = openStore(join(root, "state"))
  const settings = createSettingsService(root)
  const worktrees = createTestWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  environments = createEnvironments({
    store: storage.store,
    worktrees,
    ownerId: randomUUID(),
    adapter: {
      fingerprint: async () => "stable-app",
      prepare: async (_record, signal) => {
        preparations++
        await preparation(signal)
      },
      inspect: async () => ({ runtimeId: "fixture", resources: [], endpoints: {}, healthy: true }),
      stop: async () => {},
    },
  })
  const runner = {
    version: "fixture",
    execute: async () => {
      executions++
      return { outcome: "passed" as const, cases: [], errors: [] }
    },
  }
  runs = createTestExecution({
    store: storage.store,
    settings,
    worktrees,
    environments,
    runner,
    scheduler: createScheduler(),
  })
  const submissions = createSubmissions({
    store: storage.store,
    worktrees,
    parse: parseSource,
    runnerVersion: runner.version,
  })
  app = createTestApp({ settings, worktrees, environments, runs, submissions })
})
afterEach(async () => {
  await runs.close()
  await environments.close()
  storage.close()
  await rm(root, { recursive: true, force: true })
})
test("path-based configure remains read-only and previews selection plus files", async () => {
  const result = await mcp("configure", { action: "inspect", path: root })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.validation.valid).toBe(true)
  expect(result.structuredContent.plan.activeServices).toEqual(["app"])
  expect(result.structuredContent.tests.files).toContain("example.test.ts")
  expect(storage.store.listProjects()).toEqual([])
  expect(preparations).toBe(0)
})
test("run_tests discovers a directory, snapshots files and prepares an environment without registration", async () => {
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.id).toEqual(expect.any(String))
  const id = result.structuredContent.id
  await expect.poll(() => runs.get(id).state).toBe("finished")
  expect(runs.get(id).result?.outcome).toBe("passed")
  expect(preparations).toBe(1)
  expect(executions).toBe(1)
  const run = (await mcp("get_run", { id })).structuredContent
  await expect.poll(() => environments.get(run.environmentId).state).toBe("stopped")
  expect(storage.store.getSubmission(run.submissionId)?.files).toContainEqual({
    path: "example.test.ts",
    source,
  })
  await writeFile(join(root, "tests/example.test.ts"), `${source}\n// edited`)
  expect(storage.store.getSubmission(run.submissionId)?.files[0].source).toBe(source)
  const reused = await mcp("run_tests", { path: root })
  expect(reused.isError).not.toBe(true)
  await expect.poll(() => runs.get(reused.structuredContent.id).state).toBe("finished")
  expect(preparations).toBe(2)
  expect(runs.get(reused.structuredContent.id).environmentId).not.toBe(run.environmentId)
  expect(
    (await managementHttp(app, "stop_environment", { id: run.environmentId })).isError,
  ).not.toBe(true)
})
test("cancellation during preparation finishes the run without invoking the runner", async () => {
  preparation = async (signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
      } else {
        signal.addEventListener("abort", () => resolve(), { once: true })
      }
    })
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  const id = result.structuredContent.id
  await expect.poll(() => preparations).toBe(1)
  expect((await managementHttp(app, "cancel_run", { id })).isError).not.toBe(true)
  await expect.poll(() => runs.get(id).result?.outcome).toBe("cancelled")
  expect(executions).toBe(0)
})
test("invalid paths and symlinked sources are rejected before preparing containers", async () => {
  await symlink(join(root, "compose.yaml"), join(root, "tests/leak.json"))
  expect((await mcp("run_tests", { path: root })).isError).toBe(true)
  expect(preparations).toBe(0)
  expect(storage.store.listRuns()).toEqual([])
  expect(await readFile(join(root, "tests/example.test.ts"), "utf8")).toBe(source)
})

test("settings changed during preparation cannot reach the runner", async () => {
  let release!: () => void
  preparation = async () =>
    new Promise<void>((resolve) => {
      release = resolve
    })
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  const id = result.structuredContent.id
  await expect.poll(() => preparations).toBe(1)
  await writeFile(
    join(root, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      tests: { directory: "tests", timeoutMs: 4321 },
      services: ["app"],
    }),
  )
  release()
  await expect.poll(() => runs.get(id).state).toBe("finished")
  expect(runs.get(id).result?.outcome).toBe("configuration_error")
  expect(executions).toBe(0)
})

test("cancellation racing reservation releases the acquired environment", async () => {
  const reserve = environments.reserve.bind(environments)
  let release!: () => void
  let entered = false
  environments.reserve = async (...args) => {
    entered = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return reserve(...args)
  }
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  const id = result.structuredContent.id
  await expect.poll(() => entered).toBe(true)
  await managementHttp(app, "cancel_run", { id })
  release()
  await expect.poll(() => runs.core.activeIds().length).toBe(0)
  expect(runs.get(id).result?.outcome).toBe("cancelled")
  const environmentId = runs.get(id).environmentId
  if (!environmentId) {
    throw new Error("Missing preparation environment")
  }
  expect(environments.get(environmentId).state).not.toBe("in_use")
  expect(executions).toBe(0)
})

test("preparation failure preserves environment evidence without claiming an assertion failure", async () => {
  preparation = async () => {
    throw new Error("Container unavailable")
  }
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  const id = result.structuredContent.id
  await expect.poll(() => runs.get(id).state).toBe("finished")
  expect(runs.get(id).result?.outcome).toBe("environment_error")
  expect(runs.get(id).environmentId).toBeDefined()
  expect(executions).toBe(0)
})

test("explicit environment stop cancels its queued preparation run", async () => {
  preparation = async (signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
      } else {
        signal.addEventListener("abort", () => resolve(), { once: true })
      }
    })
  const result = await mcp("run_tests", { path: root })
  expect(result.isError).not.toBe(true)
  const id = result.structuredContent.id
  await expect.poll(() => runs.get(id).environmentId).toBeDefined()
  const environmentId = runs.get(id).environmentId
  const stopped = await managementHttp(app, "stop_environment", { id: environmentId })
  expect(stopped.isError).not.toBe(true)
  await runs.stopEnvironment.idle()
  expect(runs.get(id).result?.outcome).toBe("cancelled")
  expect(stopped.structuredContent.id).toBe(environmentId)
  expect((await mcp("get_run", { id })).structuredContent.environment.state).toBe("stopped")
  expect(executions).toBe(0)
})

test("path-based configure and run_tests use shared rules without registering during inspect", async () => {
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })
  git("init")
  git("add", ".redpact", "compose.yaml", "tests")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture")
  const linked = join(root, "linked")
  git("worktree", "add", "-b", "feature", linked)
  await writeFile(join(linked, ".redpact/settings.json"), "invalid local copy")
  const inspected = await mcp("configure", { action: "inspect", path: linked })
  expect(inspected.isError).not.toBe(true)
  expect(inspected.structuredContent.validation.valid).toBe(true)
  expect(inspected.structuredContent.validation.file).toContain("/.redpact/settings.json")
  expect(inspected.structuredContent.tests.files).toContain("example.test.ts")
  expect(storage.store.listProjects()).toEqual([])
  const accepted = await mcp("run_tests", { path: linked })
  expect(accepted.isError).not.toBe(true)
  await expect.poll(() => executions).toBe(1)
  const environment = storage.store.listEnvironments()[0]
  expect(environment.projectRules?.source).toContain("composeFiles")
  expect(environment.target.projectRoot).toContain("/linked")
})

test("run_tests uses fixed settings and rejects changed invalid Compose before provisioning", async () => {
  const first = await mcp("run_tests", { path: root })
  expect(first.isError).not.toBe(true)
  await expect.poll(() => runs.get(first.structuredContent.id).state).toBe("finished")
  const prior = storage.store.listEnvironments().map((item) => JSON.stringify(item))
  await writeFile(join(root, "compose.yaml"), "services:\n  replacement:\n    image: alpine:3.21\n")
  const stale = await mcp("run_tests", { path: root })
  expect(stale.isError).toBe(true)
  expect(executions).toBe(1)
  expect(storage.store.listEnvironments().map((item) => JSON.stringify(item))).toEqual(prior)
  await writeFile(
    join(root, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      services: ["replacement"],
      tests: { directory: "tests" },
    }),
  )
  const corrected = await mcp("run_tests", { path: root })
  expect(corrected.isError).not.toBe(true)
  await expect.poll(() => runs.get(corrected.structuredContent.id).state).toBe("finished")
  await expect(readFile(join(root, ".redpact/selection.json"))).rejects.toMatchObject({
    code: "ENOENT",
  })
})

test("MCP rejects explicit environment reuse without changing saved choices", async () => {
  const first = await mcp("run_tests", { path: root })
  await expect.poll(() => runs.get(first.structuredContent.id).state).toBe("finished")
  const environmentId = runs.get(first.structuredContent.id).environmentId!
  const reused = await mcp("run_tests", { path: root, environmentId })
  expect(reused.isError).toBe(true)
  await expect(readFile(join(root, ".redpact/selection.json"))).rejects.toMatchObject({
    code: "ENOENT",
  })
  await expect.poll(() => environments.get(environmentId).state).toBe("stopped")
})
