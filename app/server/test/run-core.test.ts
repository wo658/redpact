import { expect, test } from "vitest"
import type { Run, Store, Submission } from "../src/core/types/contracts.js"
import { createRuns } from "../src/workflows/runs.js"

test("run state and runner execution work without worktree or environment services", async () => {
  const records = new Map<string, Run>()
  const submission = { id: "submission", runnerVersion: "test" } as Submission
  const store = {
    getRun: (id: string) => records.get(id),
    saveRun: (run: Run) => {
      records.set(run.id, run)
    },
    getSubmission: () => submission,
    getEnvironment: () => undefined,
    unfinishedRuns: () => [],
  } as unknown as Store
  let executed = 0
  const runs = createRuns({
    store,
    runner: {
      version: "test",
      execute: async () => {
        executed++
        return { outcome: "passed", cases: [], errors: [] }
      },
    },
  })
  expect("execute" in runs).toBe(true)
  expect("start" in runs).toBe(false)
  const run: Run = {
    id: "run",
    submissionId: "submission",
    state: "queued",
    result: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    limitations: [],
  }
  runs.accept(run)
  expect((await runs.execute(run.id)).outcome).toBe("passed")
  expect(executed).toBe(1)
  runs.finish(run.id, { outcome: "passed", cases: [], errors: [] })
  runs.finish(run.id, { outcome: "execution_error", cases: [], errors: ["late"] })
  expect(runs.get(run.id).result?.outcome).toBe("passed")
  await expect(runs.execute(run.id)).rejects.toMatchObject({ code: "invalid_input" })
  runs.accept({ ...run, id: "cancelled" })
  runs.cancel("cancelled")
  expect((await runs.execute("cancelled")).outcome).toBe("cancelled")
  expect(executed).toBe(1)
})
