export function createRuntimeShutdown(
  steps: ReadonlyArray<{ name: string; close: () => void | Promise<void> }>,
  release: () => void,
) {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= (async () => {
      const errors: Error[] = []
      for (const step of steps) {
        try {
          await step.close()
        } catch (cause) {
          errors.push(new Error(`Failed to close ${step.name}`, { cause }))
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Runtime shutdown failed")
      }
      release()
    })()
    return pending
  }
}
