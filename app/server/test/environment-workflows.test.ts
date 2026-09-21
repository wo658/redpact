import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestApp as createApp, createTestExecution } from "./helpers/execution.js"
import { managementHttp } from "./helpers/management-http.js"
import { createTestWorktrees as createWorktrees } from "./helpers/worktrees.js"

let root: string
let storage: ReturnType<typeof openStore>
let app: ReturnType<typeof createApp>
let environments: ReturnType<typeof createEnvironments>
let runs: ReturnType<typeof createTestExecution>
let worktreeId: string
let submissionId: string
let expectedSettingsDigest: string
const selection = { services: ["app"], select: {} }
let stops = 0
let executions = 0
let outcome: "passed" | "assertion_failed" = "passed"
let failStop = false
const headers = { "Content-Type": "application/json" }
async function request(path: string, body?: object) {
  return app.request(path, {
    headers,
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  })
}
async function _operation(name: string, args: object) {
  if (!["configure", "get_run"].includes(name)) {
    return managementHttp(app, name, args)
  }
  const response = await app.request("/mcp", {
    method: "POST",
    headers: { ...headers, Host: "localhost", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  })
  const result = await response.json()
  expect(result.error).toBeUndefined()
  return result.result
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-env-api-"))
  stops = 0
  executions = 0
  outcome = "passed"
  failStop = false
  const projectRoot = join(root, "project")
  await mkdir(join(projectRoot, ".redpact"), { recursive: true })
  await writeFile(join(projectRoot, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(projectRoot, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml"], services: ["app"] }),
  )
  storage = openStore(join(root, "state"))
  const settings = createSettingsService(projectRoot)
  const validation = await settings.read()
  if (!validation.digest) {
    throw new Error(JSON.stringify(validation.issues))
  }
  expectedSettingsDigest = validation.digest
  const worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  const project = await worktrees.connect(projectRoot)
  worktreeId = (await worktrees.ensure(project.id, projectRoot)).id
  environments = createEnvironments({
    store: storage.store,
    worktrees,
    ownerId: randomUUID(),
    adapter: {
      fingerprint: async () => "fixed-input",
      prepare: async () => {},
      inspect: async () => ({ runtimeId: "runtime", resources: [], endpoints: {}, healthy: true }),
      stop: async () => {
        stops++
        if (failStop) {
          throw new Error("cleanup failed")
        }
      },
    },
  })
  const runner = {
    version: "fake",
    execute: async (_submission: unknown, _run: string, signal: AbortSignal) => {
      executions++
      if (signal.aborted) {
        return { outcome: "cancelled" as const, errors: [], cases: [] }
      }
      return { outcome, errors: [], cases: [] }
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
  const work = await submissions.createWork("Observe cancellation", worktreeId)
  submissionId = (
    await submissions.submitForWork(work.id, [{ path: "example.test.ts", source: "" }])
  ).id
  app = createApp({ settings, worktrees, environments, runs, submissions })
})
afterEach(async () => {
  await runs.close()
  await environments.close()
  storage.close()
  await rm(root, { recursive: true, force: true })
})
async function completed(body: object) {
  const run = await (await request("/api/runs", body)).json()
  expect(run.id).toEqual(expect.any(String))
  await expect.poll(() => runs.get(run.id).state).toBe("finished")
  await environments.idle()
  await runs.stopEnvironment.idle()
  return runs.get(run.id)
}

test("manual environment preparation is no longer exposed", async () => {
  const response = await request("/api/environments", {
    worktreeId,
    requestId: randomUUID(),
    expectedSettingsDigest,
    selection,
  })
  expect(response.status).toBe(404)
  expect(environments.list(worktreeId)).toEqual([])
})

test("each execution creates and removes its own environment while preserving history", async () => {
  await app.request(`/api/worktrees/${worktreeId}/selection`, {
    method: "PUT",
    headers,
    body: JSON.stringify(selection),
  })
  const first = await completed({ submissionId })
  const second = await completed({ submissionId })
  expect(first.environmentId).not.toBe(second.environmentId)
  await expect.poll(() => stops).toBe(2)
  for (const run of [first, second]) {
    expect(environments.get(run.environmentId!).state).toBe("stopped")
    expect(environments.get(run.environmentId!).runIds).toEqual([run.id])
    expect(run.result?.outcome).toBe("passed")
  }
  expect(executions).toBe(2)
})
test("HTTP rejects explicit environment reuse and retention policies", async () => {
  for (const fields of [{ environmentId: randomUUID() }, { retain: "always" }]) {
    expect((await request("/api/runs", { submissionId, selection, ...fields })).status).toBe(400)
  }
  expect(executions).toBe(0)
  expect(environments.list(worktreeId)).toEqual([])
})
test("an approved request with changed settings cannot refresh an environment before rejection", async () => {
  const refresh = vi.spyOn(environments, "prepare")
  await writeFile(
    join(root, "project/.redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      tests: { timeoutMs: 1234 },
      services: ["app"],
    }),
  )
  await expect(runs.start(submissionId, selection, expectedSettingsDigest)).rejects.toThrow(
    "Settings changed after approval",
  )
  expect(refresh).not.toHaveBeenCalled()
  expect(executions).toBe(0)
})

for (const verdict of ["passed", "assertion_failed"] as const) {
  test(`통합테스트 ${verdict} 후 환경을 제거하고 결과를 보존한다`, async () => {
    outcome = verdict
    const accepted = await runs.start(submissionId, selection)
    await expect.poll(() => runs.get(accepted.id).state).toBe("finished")
    const run = runs.get(accepted.id)
    await expect.poll(() => environments.get(run.environmentId!).state).toBe("stopped")
    expect(stops).toBe(1)
    expect(runs.get(run.id).result?.outcome).toBe(verdict)
    expect(run.environmentPolicy).toEqual({ source: "new", retain: "never" })
  })
}

test("자동 정리 실패는 테스트 성공을 덮어쓰지 않고 재시도할 수 있다", async () => {
  failStop = true
  const accepted = await runs.start(submissionId, selection)
  await expect.poll(() => runs.get(accepted.id).state).toBe("finished")
  const run = runs.get(accepted.id)
  await expect.poll(() => environments.get(run.environmentId!).state).toBe("stop_failed")
  expect(runs.get(run.id).result?.outcome).toBe("passed")
  failStop = false
  await runs.stopEnvironment(run.environmentId!)
  await runs.stopEnvironment.idle()
  expect(environments.get(run.environmentId!).state).toBe("stopped")
})
