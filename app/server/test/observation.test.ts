import { expect, test } from "vitest"
import { createApp } from "../src/app.js"
import { createRunQueries } from "../src/workflows/run-queries.js"
import { createSubmissions } from "../src/workflows/submissions.js"

test("observation discovery scopes submissions and runs and omits source from lists", async () => {
  const entries = Array.from({ length: 22 }, (_, i) => ({
    id: `s${String(i).padStart(2, "0")}`,
    worktreeId: i === 21 ? "other" : "tree",
    workItemId: "work",
    createdAt: "2026-09-07",
    digest: "digest",
    files: [{ source: "private source" }],
  }))
  const store = {
    getWorktree: (id: string) => (id === "tree" ? { id } : undefined),
    listSubmissions: () => entries,
    submissionPage: (worktreeId: string, before: string | undefined, limit: number) => {
      const scoped = entries
        .filter((item) => item.worktreeId === worktreeId)
        .sort((a, b) => b.id.localeCompare(a.id))
      const cursor = before ? scoped.findIndex((item) => item.id === before) : -1
      return before && cursor < 0 ? undefined : scoped.slice(cursor + 1, cursor + 1 + limit)
    },
    getSubmission: (id: string) => entries.find((s) => s.id === id),
    getWorkItem: () => ({ intent: "Observed intent" }),
    listRuns: () => [
      {
        id: "r1",
        submissionId: "s00",
        createdAt: "now",
        state: "finished",
        result: { outcome: "passed", cases: [] },
      },
      { id: "r2", submissionId: "s01", createdAt: "now" },
    ],
  }
  const app = createApp({
    submissions: createSubmissions({ store, parse: () => ({}), runnerVersion: "test" } as never),
    runs: createRunQueries(store as never),
  } as never)
  const response = await app.request("/api/submissions?worktreeId=tree")
  expect(response.status).toBe(200)
  const page = await response.json()
  expect(page.items).toHaveLength(20)
  expect(page.items[0]).toMatchObject({ id: "s20", intent: "Observed intent" })
  expect(JSON.stringify(page)).not.toContain("private source")
  const next = await (
    await app.request(`/api/submissions?worktreeId=tree&before=${page.nextCursor}`)
  ).json()
  expect(next.items.map((s: { id: string }) => s.id)).toEqual(["s00"])
  const runs = await (await app.request("/api/runs?submissionId=s00")).json()
  expect(runs.items.map((r: { id: string }) => r.id)).toEqual(["r1"])
  expect((await app.request("/api/submissions")).status).toBe(400)
  expect((await app.request("/api/submissions?worktreeId=missing")).status).toBe(404)
})

test("execution log discovery is worktree-scoped, newest first and excludes unexecuted submissions", async () => {
  const entries = [
    { id: "s1", worktreeId: "tree", workItemId: "work" },
    { id: "s2", worktreeId: "tree", workItemId: "work" },
    { id: "unexecuted", worktreeId: "tree", workItemId: "work" },
    { id: "other", worktreeId: "other", workItemId: "work" },
  ]
  const records = Array.from({ length: 22 }, (_, i) => ({
    id: `r${String(i).padStart(2, "0")}`,
    submissionId: i === 21 ? "other" : `s${(i % 2) + 1}`,
    createdAt: "2026-09-08T01:00:00Z",
    finishedAt: "2026-09-08T01:00:01Z",
    state: "finished",
    result: { outcome: "failed", cases: [], errors: [] },
  }))
  const store = {
    getWorktree: (id: string) => (id === "tree" ? { id } : undefined),
    listSubmissions: () => entries,
    getWorkItem: () => ({ intent: "Recorded intent" }),
    listRuns: () => records,
  }
  const app = createApp({ runs: createRunQueries(store as never) } as never)
  const response = await app.request("/api/runs?worktreeId=tree")
  expect(response.status).toBe(200)
  const page = await response.json()
  expect(page.items).toHaveLength(20)
  expect(page.items[0]).toMatchObject({ id: "r20", intent: "Recorded intent", outcome: "failed" })
  expect(page.items.map((r: { id: string }) => r.id)).not.toContain("r21")
  const next = await (
    await app.request(`/api/runs?worktreeId=tree&before=${page.nextCursor}`)
  ).json()
  expect(next.items.map((r: { id: string }) => r.id)).toEqual(["r00"])
  expect((await app.request("/api/runs?worktreeId=missing")).status).toBe(404)
  expect((await app.request("/api/runs?worktreeId=tree&before=r21")).status).toBe(400)
  expect((await app.request("/api/runs?worktreeId=tree&submissionId=s1")).status).toBe(400)
})

test("execution logs read persisted output only for an existing run", async () => {
  const reads: string[] = []
  const store = { getRun: (id: string) => (id === "r1" ? { id } : undefined) }
  const queries = createRunQueries(store as never, async (id: string) => {
    reads.push(id)
    return { stdout: { text: "actual output", truncated: false }, stderr: null }
  })
  const app = createApp({ runs: queries } as never)
  const response = await app.request("/api/runs/r1/logs")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    stdout: { text: "actual output", truncated: false },
    stderr: null,
  })
  expect((await app.request("/api/runs/missing/logs")).status).toBe(404)
  expect(reads).toEqual(["r1"])
})
