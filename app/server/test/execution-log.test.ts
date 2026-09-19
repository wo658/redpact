import { expect, test } from "vitest"
import { createApp } from "../src/app.js"
import { createRunQueries } from "../src/workflows/run-queries.js"

const unit = {
  id: "same",
  worktreeId: "tree",
  settings: { command: "arbitrary command" },
  state: "finished",
  outcome: "command_succeeded",
  createdAt: "2026-09-12T10:00:00Z",
  finishedAt: null,
  stdout: "unit output",
  stderr: "",
  exitCode: 0,
  truncated: true,
  error: null,
  cleanup: { state: "removed", error: null },
}
const capture = {
  id: "same",
  worktreeId: "tree",
  target: "login",
  scope: "worktree",
  purpose: "functional",
  state: "finished",
  outcome: "failed",
  createdAt: "2026-09-12T10:00:00Z",
  before: { state: "unavailable", cases: [] },
  after: {
    state: "finished",
    cases: [
      { title: "login", file: "login.ts", status: "failed", errors: ["actual timeout"], steps: [] },
    ],
  },
}
function queries() {
  const run = {
    id: "integration",
    submissionId: "s",
    state: "finished",
    createdAt: "2026-09-11",
    finishedAt: null,
    result: { outcome: "passed", errors: [], cases: [] },
  }
  return createRunQueries(
    {
      getWorktree: (id: string) => (id === "tree" ? { id } : undefined),
      listSubmissions: () => [{ id: "s", worktreeId: "tree", workItemId: "w" }],
      getWorkItem: () => ({ intent: "API test" }),
      listRuns: () => [run],
      getRun: (id: string) => (id === run.id ? run : undefined),
    } as never,
    async () => ({ stdout: null, stderr: { text: "", truncated: false } }),
    {
      units: () => [unit, { ...unit, id: "hidden", worktreeId: "other" }],
      captures: () => [capture],
    } as never,
  )
}
test("execution list combines recorded types without output and scopes cursors", () => {
  const q = queries()
  const page = q.listForWorktree("tree")
  expect(page.items.map((r) => r.kind)).toEqual(["unit", "playwright", "integration"])
  expect(page.items.map((r) => r.intent)).toEqual(["arbitrary command", "login", "API test"])
  expect(JSON.stringify(page)).not.toContain("unit output")
  expect(q.listForWorktree("tree", "unit:same").items.map((r) => r.kind)).toEqual([
    "playwright",
    "integration",
  ])
  expect(() => q.listForWorktree("tree", "unit:hidden")).toThrow()
})
test("copy endpoint returns recorded diagnostics for each execution kind", async () => {
  const app = createApp({ runs: queries() } as never)
  const read = async (kind: string, id: string) =>
    app.request(`/api/runs/executions/${kind}/${id}/copy`)
  const response = await read("unit", "same")
  expect(response.status).toBe(200)
  expect((await response.json()).text).toContain("unit output")
  const browserLog = (await (await read("playwright", "same")).json()).text
  expect(browserLog).toContain("actual timeout")
  expect(browserLog).toContain("Scope: worktree")
  expect((await (await read("integration", "integration")).json()).text).toContain("not recorded")
  expect((await read("unit", "missing")).status).toBe(404)
  expect((await read("invalid", "same")).status).toBe(400)
})

test("log live updates include only this worktree's unit and Playwright records", async () => {
  const { eventScope } = await import("../src/workflows/event-scope.js")
  const scope = await eventScope(
    {
      dataDirectory: "/runtime",
      worktrees: { getWorktree: () => ({ projectRoot: "/project" }) },
      unitTests: { get: (id: string) => ({ worktreeId: id === "mine" ? "tree" : "other" }) },
      captures: { get: (id: string) => ({ worktreeId: id === "mine" ? "tree" : "other" }) },
    } as never,
    { worktreeId: "tree", scope: "evidence" },
  )
  expect(scope.roots.map((root) => root.path)).toContain("/runtime/unit-runs")
  expect(scope.roots.map((root) => root.path)).toContain("/runtime/playwright-runs")
  for (const kind of ["unit-runs", "playwright-runs"]) {
    expect(scope.accepts(`/runtime/${kind}/mine.json`)).toBe(true)
    expect(scope.accepts(`/runtime/${kind}/other.json`)).toBe(false)
  }
})
