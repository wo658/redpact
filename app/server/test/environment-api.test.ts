import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import type { RunResult } from "../src/core/types/contracts.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestApp as createApp, createTestExecution } from "./helpers/execution.js"
import { managementHttp } from "./helpers/management-http.js"
import { resourceLimit } from "./helpers/resource-limit.js"
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
let completion: RunResult
const headers = { "Content-Type": "application/json" }
async function request(path: string, body?: object) {
  return app.request(path, {
    headers,
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  })
}
async function operation(name: string, args: object) {
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
  completion = { outcome: "passed", errors: [], cases: [] }
  const projectRoot = join(root, "project")
  await mkdir(join(projectRoot, ".redpact"), { recursive: true })
  await writeFile(join(projectRoot, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(projectRoot, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml"] }),
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
      },
    },
  })
  const runner = {
    version: "fake",
    execute: async (_submission: unknown, _run: string, signal: AbortSignal) => {
      executions++
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve()
        } else {
          signal.addEventListener("abort", () => resolve(), { once: true })
        }
      })
      return completion
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
test("HTTP lists execution environments and preserves their immutable run links", async () => {
  await app.request(`/api/worktrees/${worktreeId}/selection`, {
    method: "PUT",
    headers,
    body: JSON.stringify(selection),
  })
  const response = await request("/api/runs", { submissionId })
  expect(response.status).toBe(202)
  const run = await response.json()
  await expect.poll(() => runs.get(run.id).state).toBe("running")
  const id = runs.get(run.id).environmentId!
  expect((await operation("list_environments", { worktreeId })).structuredContent).toHaveLength(1)
  expect((await request(`/api/environments/${id}`)).status).toBe(200)
  runs.cancel(run.id)
  await expect.poll(() => environments.get(id).state).toBe("stopped")
  expect(stops).toBe(1)
  expect(storage.store.getRun(run.id)?.environmentId).toBe(id)
})
test("explicit environment stop cancels its active test before deleting resources", async () => {
  await app.request(`/api/worktrees/${worktreeId}/selection`, {
    method: "PUT",
    headers,
    body: JSON.stringify(selection),
  })
  const response = await operation("run_tests", { submissionId })
  const runId = response.structuredContent.id
  await expect.poll(() => runs.get(runId).state).toBe("running")
  const id = runs.get(runId).environmentId!
  expect((await operation("stop_environment", { id })).isError).not.toBe(true)
  await environments.idle()
  await runs.stopEnvironment.idle()
  expect(runs.get(runId).result?.outcome).toBe("cancelled")
  expect(environments.get(id).state).toBe("stopped")
  expect(stops).toBe(1)
})

test("queued cancellation cannot start the runner after delayed environment resolution", async () => {
  let release!: () => void
  environments.executionValues = async () => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return {}
  }
  const run = await runs.start(submissionId, selection)
  await expect.poll(() => typeof release).toBe("function")
  runs.cancel(run.id)
  release()
  await runs.close()
  expect(runs.get(run.id).result?.outcome).toBe("cancelled")
  expect(executions).toBe(0)
})

test("corrupt environment linkage is rejected when reading historical run evidence", async () => {
  const run = await runs.start(submissionId, selection)
  runs.cancel(run.id)
  await runs.close()
  const path = join(root, "state/runs", run.id, "state.json")
  const { readFile } = await import("node:fs/promises")
  const original = await readFile(path, "utf8")
  const record = JSON.parse(original)
  record.data.environmentId = randomUUID()
  await writeFile(path, JSON.stringify(record))
  try {
    expect(() => storage.store.getRun(run.id)).toThrow("environment")
  } finally {
    await writeFile(path, original)
  }
})

async function writeModes() {
  await writeFile(
    join(root, "project/.redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      applicationServices: { web: { services: ["app"] } },
      relationships: [
        {
          from: "web",
          to: { kind: "dependency", name: "payments" },
          description: "Payment processing",
          evidence: [{ path: "src/payments.ts", line: 12 }],
        },
      ],
      dependencies: {
        payments: {
          modes: {
            mock: { env: { app: { MODE: "mock" } } },
            remote: { env: { app: { API_KEY: { secret: "MISSING_CLOUD_KEY" } } } },
          },
        },
      },
    }),
  )
}

test("HTTP dependency discovery agrees with MCP configure selection preview", async () => {
  await writeModes()
  const response = await request(`/api/worktrees/${worktreeId}/dependencies`)
  expect(response.status).toBe(200)
  const catalog = await response.json()
  expect(catalog.dependencies.payments.modes.mock.env.app).toEqual({ MODE: "mock" })
  expect(catalog.applicationServices).toEqual({ web: { services: ["app"] } })
  expect(catalog.relationships).toEqual([
    {
      from: "web",
      to: { kind: "dependency", name: "payments" },
      description: "Payment processing",
      evidence: [{ path: "src/payments.ts", line: 12 }],
    },
  ])
  expect((await operation("get_dependencies", { worktreeId })).structuredContent).toEqual(catalog)
  expect((await request(`/api/worktrees/${worktreeId}/dependencies/payments`)).status).toBe(200)
  expect((await request(`/api/worktrees/${worktreeId}/dependencies/missing`)).status).toBe(404)
  const selection = { services: ["app"], select: { payments: "mock" } }
  const preview = await (
    await request(`/api/worktrees/${worktreeId}/dependencies/plan`, selection)
  ).json()
  expect(preview.plan.bindings.app).toEqual({ MODE: { value: "mock" } })
  expect(
    (await operation("configure", { action: "validate", worktreeId, selection })).structuredContent
      .plan,
  ).toEqual(preview.plan)
  const run = await runs.start(submissionId, selection)
  await expect.poll(() => runs.get(run.id).state).toBe("running")
  expect(environments.get(runs.get(run.id).environmentId!).selection).toEqual(selection)
  runs.cancel(run.id)
  await expect.poll(() => environments.get(runs.get(run.id).environmentId!).state).toBe("stopped")
})
test("retired format/scenario parameters and missing execution selection are rejected", async () => {
  expect((await operation("configure", { action: "describe", version: 4 })).isError).toBe(true)
  expect(
    (await operation("configure", { action: "validate", worktreeId, scenario: "old" })).isError,
  ).toBe(true)
  expect((await request("/api/environments", { worktreeId, requestId: randomUUID() })).status).toBe(
    404,
  )
  expect((await request("/api/runs", { submissionId })).status).toBe(409)
})

for (const action of ["cancel", "close"] as const) {
  test(`temporary environment is removed after ${action} waits for the test process`, async () => {
    const run = await runs.start(submissionId, selection)
    await expect.poll(() => runs.get(run.id).state).toBe("running")
    const environmentId = runs.get(run.id).environmentId!
    if (action === "cancel") {
      runs.cancel(run.id)
    } else {
      await runs.close()
    }
    await expect.poll(() => environments.get(environmentId).state).toBe("stopped")
    expect(runs.get(run.id).result?.outcome).toBe("cancelled")
    expect(stops).toBe(1)
  })
}

test("한도 초과 후 늦은 취소가 원인을 덮지 않고 HTTP와 재시작 기록에 보존한다", async () => {
  const run = await runs.start(submissionId, selection)
  await expect.poll(() => executions).toBe(1)
  completion = {
    outcome: "execution_error",
    cases: [],
    errors: ["Memory limit exceeded"],
    resourceLimit,
  }
  runs.cancel(run.id)
  await expect.poll(() => runs.get(run.id).state).toBe("finished")
  const result = await (await request(`/api/runs/${run.id}`)).json()
  expect(result.result).toEqual(completion)
  await runs.close()
  await environments.close()
  storage.close()
  const reopened = openStore(join(root, "state"))
  try {
    expect(reopened.store.listRuns().find((item) => item.id === run.id)?.result).toEqual(completion)
  } finally {
    reopened.close()
  }
})
