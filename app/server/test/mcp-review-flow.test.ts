import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createLocalFiles } from "../src/adapters/sources/local.js"
import { openStore } from "../src/adapters/storage/files.js"
import { loadInstance } from "../src/adapters/storage/instance.js"
import { createReviewStore } from "../src/adapters/storage/reviews.js"
import { createEnvironments } from "../src/workflows/environments.js"
import { createReviewTests } from "../src/workflows/review-tests.js"
import { createCollectTests } from "../src/workflows/run-files.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestApp, createTestExecution } from "./helpers/execution.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

let root: string
let storage: ReturnType<typeof openStore>
let execution: ReturnType<typeof createTestExecution>
let environments: ReturnType<typeof createEnvironments>
let reviews: ReturnType<typeof createReviewTests>
let app: ReturnType<typeof createTestApp>
let preparations: number
let executions: number
const selection = { services: ["app"], select: { payment: "mock" } }
async function rpc(method: string, params?: object) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      Host: "localhost",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  return (await response.json()).result
}
const call = (name: string, args: object) => rpc("tools/call", { name, arguments: args })
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-review-flow-"))
  await mkdir(join(root, ".redpact"))
  await mkdir(join(root, "integration"))
  await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(root, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: { payment: { kind: "mock" } },
      services: ["app"],
    }),
  )
  await writeFile(
    join(root, "integration/order.test.ts"),
    'import { test, expect } from "vitest"; test("Accept an order", () => expect(1).toBe(1))',
  )
  storage = openStore(join(root, "state"))
  loadInstance(join(root, "state"))
  const policy = createReviewStore(join(root, "state"))
  policy.setPolicy("ask")
  const settings = createSettingsService(root)
  const worktrees = createTestWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  preparations = 0
  executions = 0
  environments = createEnvironments({
    store: storage.store,
    worktrees,
    ownerId: randomUUID(),
    adapter: {
      fingerprint: async () => "app-inputs",
      prepare: async () => {
        preparations++
      },
      inspect: async () => ({ runtimeId: "test", resources: [], endpoints: {}, healthy: true }),
      stop: async () => {},
    },
  })
  const runner = {
    version: "test",
    execute: async () => {
      executions++
      return { outcome: "passed" as const, cases: [], errors: [] }
    },
  }
  execution = createTestExecution({
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
  const files = createLocalFiles()
  const collect = createCollectTests({ files, worktrees, submissions, executeTests: execution })
  reviews = createReviewTests({
    store: policy,
    collect: async (input) => {
      const result = await collect(input)
      return { ...result, selection: result.selection! }
    },
    settings: (path) => files.settings(path),
    submissions,
    execute: execution,
    runs: execution,
  })
  app = createTestApp({ reviews, settings, worktrees, environments, runs: execution, submissions })
})
afterEach(async () => {
  await reviews.close()
  await execution.close()
  await environments.close()
  storage.close()
  await rm(root, { recursive: true, force: true })
})

test("MCP Ask exposes real snapshots and UI-only controls, then starts only after both approvals", async () => {
  const tools = (await rpc("tools/list")).tools
  expect(
    tools
      .filter((tool: { _meta?: { ui?: { visibility?: string[] } } }) =>
        tool._meta?.ui?.visibility?.includes("app"),
      )
      .map((tool: { name: string }) => tool.name)
      .sort(),
  ).toEqual(["review_action", "set_approval_policy"])
  let result = await call("run_tests", { path: root })
  expect(result.structuredContent.state).toBe("awaiting_approval")
  const id = result.structuredContent.id
  expect(result._meta.redpact.submission.parsed[0].review.scenarios[0].title).toBe(
    "Accept an order",
  )
  expect(JSON.stringify(result.structuredContent)).not.toContain(result._meta.redpact.token)
  expect(result.content[0].text).not.toContain(result._meta.redpact.token)
  expect(preparations).toBe(0)
  expect(executions).toBe(0)
  const token = result._meta.redpact.token
  expect(
    (
      await call("review_action", {
        id,
        token: "x".repeat(64),
        revision: 0,
        subject: "environment",
      })
    ).isError,
  ).toBe(true)
  result = await call("review_action", {
    id,
    token,
    revision: 0,
    subject: "environment",
  })
  expect(result.isError).not.toBe(true)
  expect(result._meta.redpact.review.selection.select.payment).toBe("mock")
  expect(preparations).toBe(0)
  await writeFile(
    join(root, "integration/order.test.ts"),
    'throw new Error("changed after review")',
  )
  result = await call("review_action", { id, token, revision: 1, subject: "tests" })
  expect(result.isError).not.toBe(true)
  const runId = result.structuredContent.id
  await expect.poll(() => execution.get(runId).state).toBe("finished")
  expect(executions).toBe(1)
  expect(preparations).toBe(1)
  expect(
    storage.store.getSubmission(result.structuredContent.submissionId)?.files[0].source,
  ).toContain("Accept an order")
  const duplicate = await call("review_action", { id, token, revision: 1, subject: "tests" })
  expect(duplicate.structuredContent.id).toBe(runId)
  expect(executions).toBe(1)
  expect((await call("get_run", { id })).structuredContent.id).toBe(runId)
})

test("Ask to Auto changes future requests without granting the pending request approval", async () => {
  const pending = await call("run_tests", { path: root })
  const response = await call("set_approval_policy", {
    token: pending._meta.redpact.token,
    policy: "auto",
  })
  expect(response.isError).not.toBe(true)
  expect(
    (await call("get_run", { id: pending.structuredContent.id })).structuredContent.state,
  ).toBe("awaiting_approval")
  const next = await call("run_tests", { path: root })
  await expect.poll(() => execution.get(next.structuredContent.id).state).toBe("finished")
  expect(next._meta.redpact.review.policy).toBe("auto")
  expect(next._meta.redpact.review.testsApproved).toBe(false)
  const cancelled = await reviews.cancel(pending.structuredContent.id)
  expect(cancelled?.review.state).toBe("cancelled")
  expect(
    (
      await call("review_action", {
        id: pending.structuredContent.id,
        token: pending._meta.redpact.token,
        revision: 0,
        subject: "environment",
      })
    ).isError,
  ).toBe(true)
})

test("Settings API persists policy and enforces the existing browser origin boundary", async () => {
  const get = await app.request("/api/approval-policy")
  expect(await get.json()).toEqual({ policy: "ask" })
  const blocked = await app.request("/api/approval-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://foreign.example" },
    body: JSON.stringify({ policy: "auto" }),
  })
  expect(blocked.status).toBe(403)
  const set = await app.request("/api/approval-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy: "auto" }),
  })
  expect(await set.json()).toEqual({ policy: "auto" })
  expect(createReviewStore(join(root, "state")).policy()).toBe("auto")
})

test("fixed settings supply a review snapshot and later changes require fresh review", async () => {
  const pending = await call("run_tests", { path: root })
  expect(pending.isError).not.toBe(true)
  expect(pending.structuredContent.state).toBe("awaiting_approval")
  await writeFile(
    join(root, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      services: ["app"],
      dependencies: { payment: { kind: "remote" } },
    }),
  )
  expect(reviews.get(pending.structuredContent.id)?.review.selection).toEqual(selection)
  expect(preparations).toBe(0)
  const id = pending.structuredContent.id
  const token = pending._meta.redpact.token
  const changed = await call("review_action", { id, token, revision: 0, subject: "environment" })
  expect(changed.isError).toBe(true)
  expect(preparations).toBe(0)
  expect(executions).toBe(0)
})
