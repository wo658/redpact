import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import {
  createTestApp as createApp,
  createTestExecution,
  type TestServices as Services,
} from "./helpers/execution.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

let directory: string
let storage: ReturnType<typeof openStore>
let worktreeId: string
let worktrees: ReturnType<typeof createTestWorktrees>
let services: Services
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "redpact-test-"))
  storage = openStore(directory)
  await mkdir(join(directory, ".redpact"))
  await writeFile(
    join(directory, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "dependencies": {}}',
  )
  await writeFile(join(directory, "compose.yaml"), "services:\n  app:\n    image: example/app\n")
  worktrees = createTestWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  const project = await worktrees.connect(directory)
  worktreeId = (await worktrees.ensure(project.id, directory)).id
  const settings = createSettingsService(directory)
  const runner = createVitestRunner(directory)
  services = {
    settings,
    worktrees,
    defaultWorktreeId: worktreeId,
    submissions: createSubmissions({
      worktrees,
      defaultWorktreeId: worktreeId,
      store: storage.store,
      parse: parseSource,
      runnerVersion: runner.version,
    }),
    runs: createTestExecution({
      worktrees,
      defaultWorktreeId: worktreeId,
      store: storage.store,
      runner,
      scheduler: createScheduler(),
      settings: createSettingsService(directory),
    }),
  }
})
afterEach(async () => {
  await services.runs.close()
  storage.close()
  await rm(directory, { recursive: true, force: true })
})

async function completed(id: string) {
  await expect.poll(() => services.runs.get(id).state, { timeout: 15000 }).toBe("finished")
  return services.runs.get(id)
}
function submit(source: string) {
  const item = services.submissions.createWorkItem(
    "Compare reviewed tests with observed results",
    worktreeId,
  )
  return services.submissions.submit(item.id, [{ path: "example.test.ts", source }])
}

test("container-only secrets redact test output without being inherited by the test process", async () => {
  vi.stubEnv("PAYMENTS_KEY", "private-container-only-key")
  try {
    await writeFile(
      join(directory, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        dependencies: {
          payments: {
            modes: { remote: { env: { app: { API_KEY: { secret: "PAYMENTS_KEY" } } } } },
          },
        },
      }),
    )
    const submission = submit(`import { test, expect } from "vitest";
      test("response containing credentials", () => {
        expect(process.env.PAYMENTS_KEY).toBeUndefined();
        process.stdout.write("private-container-only-key");
      });`)
    const run = await services.runs.start(submission.id, {
      services: ["app"],
      select: { payments: "remote" },
    })
    expect((await completed(run.id)).result?.outcome).toBe("passed")
    const log = await readFile(join(directory, "runs", run.id, "stdout.log"), "utf8")
    expect(log).toContain("[REDACTED]")
    expect(log).not.toContain("private-container-only-key")
  } finally {
    vi.unstubAllEnvs()
  }
})

test("HTTP submission round trip preserves source and rejects traversal", async () => {
  const app = createApp(services)
  const headers = { "Content-Type": "application/json" }
  const work = await app.request("/api/work-items", {
    method: "POST",
    headers,
    body: JSON.stringify({ intent: "Save submitted intent" }),
  })
  expect(work.status).toBe(201)
  const { id } = await work.json()
  const source = 'import { test } from "vitest"; test("example", () => {})'
  const response = await app.request(`/api/work-items/${id}/submissions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ files: [{ path: "example.test.ts", source }] }),
  })
  expect(response.status).toBe(201)
  const submission = await response.json()
  const fetched = await app.request(`/api/submissions/${submission.id}`, { headers })
  expect((await fetched.json()).files[0].source).toBe(source)
  const invalid = await app.request(`/api/work-items/${id}/submissions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ files: [{ path: "../escape.test.ts", source }] }),
  })
  expect(invalid.status).toBe(400)
})

test("a comment or helper change produces a different immutable submission", () => {
  const item = services.submissions.createWorkItem(
    "Distinguish changed review baselines",
    worktreeId,
  )
  const files = [
    { path: "example.test.ts", source: 'import { test } from "vitest"; test("example", () => {})' },
    { path: "helper.ts", source: "export const value = 1" },
  ]
  const first = services.submissions.submit(item.id, files)
  files[1].source = "export const value = 2"
  const second = services.submissions.submit(item.id, files)
  expect(second.digest).not.toBe(first.digest)
  expect(services.submissions.get(first.id).files[1].source).toBe("export const value = 1")
})

test.each([
  [
    'import { test, expect } from "vitest"; test("mismatch", () => expect(1).toBe(2))',
    "assertion_failed",
  ],
  [
    'import { test } from "vitest"; test("helper error", () => { throw new Error("DB is unavailable") })',
    "execution_error",
  ],
  ['import { test } from "vitest"; test("broken", () => {', "collection_error"],
  ['import { test, expect } from "vitest"; test("ok", () => expect(1).toBe(1))', "passed"],
  ['import { test } from "vitest"; test.skip("not verified", () => {})', "unknown"],
])(
  "real Vitest classifies source without using exit status alone: %s",
  async (source, outcome) => {
    const submission = submit(source)
    const result = await completed((await services.runs.start(submission.id)).id)
    expect(result.result?.outcome).toBe(outcome)
    expect(result.submissionId).toBe(submission.id)
  },
  20000,
)

test("cancels an active runner and preserves the submitted source", async () => {
  const submission = submit(
    'import { test } from "vitest"; test("wait", async () => { await new Promise(r => setTimeout(r, 9000)) })',
  )
  const run = await services.runs.start(submission.id)
  await expect.poll(() => services.runs.get(run.id).state).toBe("running")
  services.runs.cancel(run.id)
  expect((await completed(run.id)).result?.outcome).toBe("cancelled")
  expect(services.submissions.get(submission.id).digest).toBe(submission.digest)
})

test("HTTP work registration preserves the shared submission store", async () => {
  const app = createApp(services)
  const response = await app.request("/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "Shared workflow" }),
  })
  expect(response.status).toBe(201)
  const work = await response.json()
  expect(storage.store.getWorkItem(work.id)?.intent).toBe("Shared workflow")
})

test("restart preserves submissions and marks unfinished runs interrupted", async () => {
  const submission = submit('import { test } from "vitest"; test("example", () => {})')
  if (!submission.projectId) {
    throw new Error("Missing project binding")
  }
  const worktree = storage.store.getWorktree(worktreeId)
  if (!worktree) {
    throw new Error("Missing worktree binding")
  }
  storage.store.saveRun({
    target: {
      projectId: submission.projectId,
      worktreeId,
      projectRoot: worktree.projectRoot,
      checkoutRoot: worktree.checkoutRoot,
    },
    id: "unfinished",
    submissionId: submission.id,
    state: "running",
    result: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    limitations: [],
  })
  await services.runs.close()
  storage.close()
  storage = openStore(directory)
  const runner = createVitestRunner(directory)
  services.runs = createTestExecution({
    worktrees,
    defaultWorktreeId: worktreeId,
    store: storage.store,
    runner,
    scheduler: createScheduler(),
    settings: createSettingsService(directory),
  })
  expect(storage.store.getSubmission(submission.id)?.digest).toBe(submission.digest)
  expect(services.runs.get("unfinished").result?.outcome).toBe("interrupted")
})

test("a test that changes its own source cannot receive a verified pass", async () => {
  const submission = submit(
    'import { test } from "vitest"; import { writeFileSync } from "node:fs"; test("rewrite", () => { writeFileSync(process.cwd() + "/example.test.ts", "// changed") })',
  )
  const run = await completed((await services.runs.start(submission.id)).id)
  expect(run.result?.outcome).toBe("unknown")
  expect(services.submissions.get(submission.id).files[0].source).toContain("writeFileSync")
})

test("HTTP and MCP reject invalid settings before creating runs, then reread a corrected file", async () => {
  const app = createApp(services)
  const headers = { "Content-Type": "application/json" }
  const submission = submit(
    'import { test, expect } from "vitest"; test("pass", () => expect(1).toBe(1))',
  )
  await writeFile(
    join(directory, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "dependencies": {}, "tests": {"timeoutMs": "wrong"}}',
  )
  const validation = await app.request("/api/settings", { headers })
  expect(validation.status).toBe(422)
  expect((await validation.json()).issues[0]).toMatchObject({ path: "tests.timeoutMs", line: 1 })
  const blocked = await app.request("/api/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({ submissionId: submission.id }),
  })
  expect(blocked.status).toBe(422)
  expect((await blocked.json()).validation.valid).toBe(false)
  const mcp = await app.request("/mcp", {
    method: "POST",
    headers: { ...headers, Host: "localhost", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "run_tests",
        arguments: { path: directory, selection: { services: ["app"], select: {} } },
      },
    }),
  })
  expect((await mcp.json()).result.isError).toBe(true)
  expect(storage.store.unfinishedRuns()).toEqual([])
  await writeFile(
    join(directory, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "dependencies": {}, "tests": {"timeoutMs": 1234}}',
  )
  const run = await services.runs.start(submission.id)
  expect((await completed(run.id)).result?.outcome).toBe("passed")
  const config = await readFile(join(directory, "runs", run.id, "vitest.config.mjs"), "utf8")
  expect(config).toContain('"testTimeout":1234')
  expect(services.runs.get(run.id).settings?.source).toContain("1234")
})

test("queued work cannot execute against settings changed after acceptance", async () => {
  const jobs: (() => Promise<unknown>)[] = []
  const runner = {
    version: "test",
    execute: vi.fn(async () => ({ outcome: "passed" as const, cases: [], errors: [] })),
  }
  const runs = createTestExecution({
    worktrees,
    defaultWorktreeId: worktreeId,
    store: storage.store,
    settings: services.settings,
    runner,
    scheduler: {
      add: async (_key, task) => {
        jobs.push(task)
        return undefined as never
      },
      idle: async () => {},
    },
  })
  const submissions = createSubmissions({
    worktrees,
    defaultWorktreeId: worktreeId,
    store: storage.store,
    parse: parseSource,
    runnerVersion: "test",
  })
  const work = submissions.createWorkItem("Protect settings snapshot", worktreeId)
  const submission = submissions.submit(work.id, [{ path: "example.test.ts", source: "" }])
  const run = await runs.start(submission.id)
  await writeFile(
    join(directory, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "dependencies": {}, "tests": {"timeoutMs": 2000}}',
  )
  await jobs[0]()
  expect(runner.execute).not.toHaveBeenCalled()
  expect(runs.get(run.id).result?.outcome).toBe("configuration_error")
  await runs.close()
})

test("captures Git context in run evidence and exposes the same service over HTTP", async () => {
  const snapshot = {
    available: true as const,
    root: directory,
    gitdir: join(directory, ".git"),
    commonGitdir: join(directory, ".git"),
    revision: "abc",
    dirty: false,
    changes: [],
  }
  const git = {
    inspect: vi.fn(async () => snapshot),
    image: vi.fn(async () => ({ before: null, after: null })),
    mergeBase: vi.fn(async () => "a".repeat(40)),
    readFile: vi.fn(async () => null),
    diff: vi.fn(async () => ({ available: true, patch: "", omitted: [] })),
  }
  const runner = {
    version: "test",
    execute: vi.fn(async () => ({ outcome: "passed" as const, cases: [], errors: [] })),
  }
  const runs = createTestExecution({
    worktrees: {
      ...worktrees,
      resolve: async (id: string) => ({ ...(await worktrees.resolve(id)), git }),
    },
    defaultWorktreeId: worktreeId,
    store: storage.store,
    runner,
    scheduler: createScheduler(),
    settings: services.settings,
    git,
  })
  const submissions = createSubmissions({
    worktrees,
    defaultWorktreeId: worktreeId,
    store: storage.store,
    parse: parseSource,
    runnerVersion: runner.version,
  })
  const item = submissions.createWorkItem("Capture repository context", worktreeId)
  const submission = submissions.submit(item.id, [{ path: "example.test.ts", source: "" }])
  const run = await runs.start(submission.id)
  await runs.close()
  expect(storage.store.getRun(run.id)?.git).toEqual(snapshot)
  const app = createApp({
    ...services,
    git,
    worktrees: {
      ...worktrees,
      resolve: async (id: string) => ({ ...(await worktrees.resolve(id)), git }),
    },
  })
  const response = await app.request("/api/git", {})
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(snapshot)
})

test("Order Desk example runs its complete source bundle through Redpact", async () => {
  const root = new URL("../../../examples/order-desk/", import.meta.url)
  const files = await Promise.all(
    ["src/shop.js", "tests/payment.js", "tests/checkout.test.js"].map(async (path) => ({
      path,
      source: await readFile(new URL(path, root), "utf8"),
    })),
  )
  const work = services.submissions.createWorkItem(
    "Review Order Desk checkout behavior",
    worktreeId,
  )
  const submission = services.submissions.submit(work.id, files)
  const run = await completed((await services.runs.start(submission.id)).id)
  expect(run.result?.outcome).toBe("passed")
  expect(run.result?.cases).toHaveLength(7)
  expect(run.result?.cases.every((item) => item.state === "passed")).toBe(true)
}, 20000)

const exampleScenarios: Record<string, { test: string; outcome: string; cancel?: boolean }> =
  JSON.parse(
    await readFile(new URL("../../../examples/order-desk/scenarios.json", import.meta.url), "utf8"),
  )
test.each(
  Object.entries(exampleScenarios).filter(
    ([name]) => name !== "checkout" && name !== "http" && name !== "steps",
  ),
)(
  "Order Desk diagnostic scenario: %s",
  async (_name, scenario) => {
    const root = new URL("../../../examples/order-desk/", import.meta.url)
    const files = await Promise.all(
      [
        "src/shop.js",
        "tests/payment.js",
        ...(_name === "mixed-results" ? ["tests/steps.ts"] : []),
        scenario.test,
      ].map(async (path) => ({
        path,
        source: await readFile(new URL(path, root), "utf8"),
      })),
    )
    const work = services.submissions.createWorkItem(
      "Review an intentional diagnostic scenario",
      worktreeId,
    )
    const submission = services.submissions.submit(work.id, files)
    const run = await services.runs.start(submission.id)
    if (scenario.cancel) {
      await expect.poll(() => services.runs.get(run.id).state).toBe("running")
      services.runs.cancel(run.id)
    }
    expect((await completed(run.id)).result?.outcome).toBe(scenario.outcome)
  },
  20000,
)

test("execution supplies the selected service manifest through run core", async () => {
  const getEnvironment = storage.store.getEnvironment.bind(storage.store)
  const observation = vi.spyOn(storage.store, "getEnvironment").mockImplementation((id) => {
    const record = getEnvironment(id)
    return record
      ? {
          ...record,
          endpoints: {
            "app:3000": { host: "127.0.0.1", port: 41001 },
            "app:9000": { host: "127.0.0.1", port: 41002 },
            "app-other:3000": { host: "127.0.0.1", port: 41003 },
          },
        }
      : record
  })
  const submission = submit(`
     import { test, expect } from "vitest";
     import { readFileSync } from "node:fs";
     test("selected services", () => {
       expect(JSON.parse(readFileSync(process.env.REDPACT_CONNECTIONS_FILE!, "utf8")))
         .toEqual({version: 1, services: {app: {ports: {"3000": {host: "127.0.0.1", port: 41001}, "9000": {host: "127.0.0.1", port: 41002}}}}});
     });
   `)
  const run = await services.runs.start(submission.id)
  expect((await completed(run.id)).result?.outcome).toBe("passed")
  observation.mockRestore()
})
