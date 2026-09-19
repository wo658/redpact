import { problem } from "../core/problems.js"
import { assertEnvironmentBinding, assertRunAdmission, finishRun } from "../core/run-policy.js"
import type { Run, RunResult, Store, TestRunner } from "../core/types/contracts.js"
import type { RunService } from "../core/types/services.js"

export function createRuns(deps: { store: Store; runner: TestRunner }): RunService {
  const controls = new Map<string, AbortController>()
  const executions = new Map<string, Promise<RunResult>>()
  const cancelled = new Set<string>()
  const get = (id: string) => deps.store.getRun(id) ?? problem("not_found", "Run not found")
  const submission = (id: string) => {
    const value = deps.store.getSubmission(id) ?? problem("not_found", "Submission not found")
    if (value.runnerVersion !== deps.runner.version) {
      problem("invalid_input", "Runner version changed; submit the test bundle again")
    }
    return value
  }
  function finish(id: string, result: RunResult) {
    const run = get(id)
    if (run.state === "finished") {
      return run
    }
    const finished = finishRun(run, result, new Date().toISOString())
    deps.store.saveRun(finished)
    return finished
  }
  function cancel(id: string) {
    const run = get(id)
    if (run.state === "finished") {
      return run
    }
    cancelled.add(id)
    controls.get(id)?.abort()
    return run.state === "queued"
      ? finish(id, { outcome: "cancelled", cases: [], errors: [] })
      : run
  }
  return {
    get,
    unfinished: () => deps.store.unfinishedRuns(),
    submission,
    finish,
    cancel,
    activeIds: () => [...controls.keys()],
    wasCancelled: (id: string) => cancelled.has(id),
    bindEnvironment(id: string, environmentId: string) {
      const run = get(id)
      assertEnvironmentBinding(run, controls.has(id))
      const bound = { ...run, environmentId }
      deps.store.saveRun(bound)
      return bound
    },
    accept(run: Run) {
      // Invalid input must fail before touching the recorded identity.
      assertRunAdmission(run, false)
      assertRunAdmission(run, Boolean(deps.store.getRun(run.id)))
      submission(run.submissionId)
      deps.store.saveRun(run)
      const control = new AbortController()
      controls.set(run.id, control)
      return control
    },
    async execute(
      id: string,
      settings?: Parameters<TestRunner["execute"]>[3],
      environment?: Record<string, string>,
      secrets?: string[],
      connections?: Parameters<TestRunner["execute"]>[6],
    ) {
      const run = get(id)
      const control =
        controls.get(id) ?? problem("invalid_input", "Run is not accepted by this process")
      if (control.signal.aborted) {
        return { outcome: "cancelled" as const, cases: [], errors: [] }
      }
      if (run.state !== "queued") {
        problem("invalid_input", "Run can execute only once")
      }
      deps.store.saveRun({ ...run, state: "running" })
      const pending = Promise.resolve().then(() =>
        deps.runner.execute(
          submission(run.submissionId),
          id,
          control.signal,
          settings,
          environment,
          secrets,
          connections,
        ),
      )
      executions.set(id, pending)
      try {
        return await pending
      } finally {
        executions.delete(id)
      }
    },
    async cancelAndWait(id: string) {
      if (!controls.has(id)) {
        return
      }
      cancel(id)
      const pending = executions.get(id)
      if (pending) {
        await Promise.allSettled([pending])
      }
    },
    release(id: string) {
      controls.delete(id)
      cancelled.delete(id)
    },
  }
}
