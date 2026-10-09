// Serialize lifecycle changes so a stop cannot race an unfinished start.
export function createRuntime<T extends { state: string; installation?: { state: string } }>(deps: {
  inspect: () => Promise<T>
  launch: () => Promise<void>
  halt?: () => Promise<void>
}) {
  let pending: Promise<unknown> = Promise.resolve()
  function enqueue(action: () => Promise<void>) {
    const result = pending.then(async () => {
      await action()
      return deps.inspect()
    })
    pending = result.catch(() => {})
    return result
  }
  return {
    status: deps.inspect,
    activate: () =>
      enqueue(async () => {
        const status = await deps.inspect()
        if (status.state === "stopped" && status.installation?.state === "installed") {
          await deps.launch()
        }
      }),
    start: () =>
      enqueue(async () => {
        if ((await deps.inspect()).state === "stopped") {
          await deps.launch()
        }
      }),
    stop: () =>
      enqueue(async () => {
        await deps.halt?.()
      }),
  }
}
