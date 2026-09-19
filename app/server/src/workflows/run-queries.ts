import { problem } from "../core/problems.js"
import type { Store } from "../core/types/contracts.js"
import type { ExecutionSources, ExecutionSummary, RunLogReader } from "../core/types/run-logs.js"
import type { RunQueries } from "../core/types/services.js"
import { executionText } from "./execution-log.js"

// A read projection joins persisted evidence without invoking lifecycle services.
export function createRunQueries(
  store: Store,
  readLogs?: RunLogReader,
  sources: ExecutionSources = { units: () => [], captures: () => [] },
): RunQueries {
  return {
    listForWorktree(worktreeId: string, before?: string) {
      if (!store.getWorktree(worktreeId)) {
        problem("not_found", "Worktree not found")
      }
      const submissions = new Map(
        store
          .listSubmissions()
          .filter((item) => item.worktreeId === worktreeId)
          .map((item) => [item.id, item]),
      )
      const integration: ExecutionSummary[] = store
        .listRuns()
        .filter((run) => submissions.has(run.submissionId))
        .map((run) => {
          const submission =
            submissions.get(run.submissionId) ?? problem("not_found", "Submission not found")
          const work =
            store.getWorkItem(submission.workItemId) ?? problem("not_found", "Work item not found")
          return {
            id: run.id,
            kind: "integration",
            submissionId: run.submissionId,
            intent: work.intent,
            state: run.state,
            outcome: run.result?.outcome ?? null,
            createdAt: run.createdAt,
            finishedAt: run.finishedAt,
          }
        })
      const units: ExecutionSummary[] = sources
        .units()
        .filter((run) => run.worktreeId === worktreeId)
        .map((run) => ({
          id: run.id,
          kind: "unit",
          intent: run.settings.command,
          state: run.state,
          outcome: run.outcome,
          createdAt: run.createdAt,
          finishedAt: run.finishedAt,
        }))
      const captures: ExecutionSummary[] = sources
        .captures()
        .filter((run) => run.worktreeId === worktreeId)
        .map((run) => ({
          id: run.id,
          kind: "playwright",
          intent: run.target,
          state: run.state,
          outcome: run.outcome ?? null,
          createdAt: run.createdAt,
          finishedAt: run.finishedAt ?? null,
        }))
      const all = [...integration, ...units, ...captures].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || key(b).localeCompare(key(a)),
      )
      const index = before ? all.findIndex((item) => key(item) === before) : -1
      if (before && index < 0) {
        problem("invalid_input", "Invalid run cursor")
      }
      const page = all.slice(index + 1, index + 21)
      return {
        items: page,
        nextCursor:
          all.length > index + 21
            ? key(page[page.length - 1] ?? problem("not_found", "Run not found"))
            : null,
      }
    },
    async copyLog(kind, id) {
      return { text: await executionText(kind, id, store, sources, readLogs) }
    },
    async logs(id: string) {
      const run = store.getRun(id) ?? problem("not_found", "Run not found")
      if (!readLogs) {
        throw new Error("Run log reader is unavailable")
      }
      return readLogs(run.id)
    },
    list(submissionId: string, before?: string) {
      if (!store.getSubmission(submissionId)) {
        problem("not_found", "Submission not found")
      }
      const all = store
        .listRuns()
        .filter((item) => item.submissionId === submissionId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      const index = before ? all.findIndex((item) => item.id === before) : -1
      if (before && index < 0) {
        problem("invalid_input", "Invalid run cursor")
      }
      const page = all.slice(index + 1, index + 21)
      return {
        items: page.map(({ id, state, createdAt, finishedAt }) => ({
          id,
          state,
          createdAt,
          finishedAt,
        })),
        nextCursor: all.length > index + 21 ? (page.at(-1)?.id ?? null) : null,
      }
    },
    get(id: string) {
      const run = store.getRun(id) ?? problem("not_found", "Run not found")
      const environment = run.environmentId ? store.getEnvironment(run.environmentId) : undefined
      return {
        ...run,
        ...(environment
          ? {
              environment: {
                id: environment.id,
                state: environment.state,
                endpoints: environment.endpoints,
                errors: environment.errors,
              },
            }
          : {}),
      }
    },
  }
}

function key(run: ExecutionSummary) {
  return `${run.kind}:${run.id}`
}
