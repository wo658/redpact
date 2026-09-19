import type { EnvironmentService, RunService, StopEnvironment } from "../core/types/services.js"

export function createStopEnvironment(deps: {
  environments: EnvironmentService
  runs: RunService
  cancelCapture?: (id: string) => Promise<boolean>
}): StopEnvironment {
  const pending = new Map<string, Promise<void>>()
  async function stop(id: string) {
    if (deps.cancelCapture) {
      const running = deps.environments.get(id).runId
      if (running) {
        await deps.cancelCapture(running)
      }
    }
    const record = await deps.environments.beginStop(id)
    if (record.state === "stopped" || pending.has(id)) {
      return record
    }
    const operation = Promise.resolve()
      .then(async () => {
        const ids = new Set([
          ...deps.runs
            .unfinished()
            .filter((run) => run.environmentId === id)
            .map((run) => run.id),
          ...(record.runId ? [record.runId] : []),
        ])
        for (const runId of ids) {
          await deps.runs.cancelAndWait(runId)
        }
        await deps.environments.completeStop(id)
      })
      .catch(() => deps.environments.failStop(id))
      .finally(() => pending.delete(id))
    pending.set(id, operation)
    return record
  }
  return Object.assign(stop, {
    async cleanupTemporary() {
      for (const environment of deps.environments.temporary()) {
        await stop(environment.id)
      }
      await Promise.all([...pending.values()])
    },
    async idle() {
      await Promise.all([...pending.values()])
    },
  })
}
