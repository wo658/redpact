// Serialize lifecycle changes so a stop cannot race an unfinished start.
export function createRuntime<T extends { state: string }>(deps: {
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
