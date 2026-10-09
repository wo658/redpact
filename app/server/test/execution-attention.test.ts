import { expect, test } from "vitest"
import type { Store } from "../src/core/types/contracts.js"
import type { ExecutionSources } from "../src/core/types/run-logs.js"
import { createRunQueries } from "../src/workflows/run-queries.js"

test("최근 실행 페이지보다 오래된 진행·정리 문제를 찾고 준비 실패와 구별한다", () => {
  const store = {
    getWorktree: () => ({ id: "worktree" }),
    listSubmissions: () => [{ id: "submission", worktreeId: "worktree", workItemId: "work" }],
    getWorkItem: () => ({ intent: "Integration evidence" }),
    listRuns: () => [
      {
        id: "preparation",
        submissionId: "submission",
        environmentId: "preparation",
        state: "finished",
        createdAt: "2026-01-01",
        result: { outcome: "environment_error" },
      },
      {
        id: "cleanup",
        submissionId: "submission",
        environmentId: "cleanup",
        state: "finished",
        createdAt: "2026-01-02",
        result: { outcome: "passed" },
      },
    ],
    getEnvironment: (id: string) => ({
      state: id === "preparation" ? "failed" : "stop_failed",
      errors: ["failure"],
    }),
  }
  const units = Array.from({ length: 25 }, (_, index) => ({
    id: `unit-${index}`,
    worktreeId: "worktree",
    state: index === 0 ? "running" : "finished",
    settings: { command: "pnpm test" },
    cleanup: { state: index === 1 ? "failed" : "removed" },
    outcome: "command_succeeded",
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}`,
    finishedAt: null,
  }))
  const service = createRunQueries(store as unknown as Store, undefined, {
    units: () => units,
    captures: () => [],
  } as unknown as ExecutionSources)
  expect(service.listForWorktree("worktree").items).toHaveLength(20)
  const attention = service.attentionForWorktree("worktree")
  expect(attention.active.map((run) => run.id)).toEqual(["unit-0"])
  expect(attention.cleanup.map((run) => run.id)).toEqual(["unit-1", "cleanup"])
  expect(attention).toMatchObject({ activeCount: 1, cleanupCount: 2 })
})
