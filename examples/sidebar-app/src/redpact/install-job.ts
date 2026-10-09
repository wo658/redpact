export type PackageManager = "npm" | "pnpm"
export function createInstallJob(perform: (manager: PackageManager) => Promise<void>) {
  let state: "idle" | "installing" | "failed" = "idle"
  let error = ""
  let pending: Promise<void> | undefined
  return {
    status: () => ({ state, error }),
    start(manager: PackageManager) {
      if (pending) {
        return
      }
      state = "installing"
      error = ""
      pending = Promise.resolve()
        .then(() => perform(manager))
        .then(() => {
          state = "idle"
        })
        .catch((failure: unknown) => {
          state = "failed"
          error = failure instanceof Error ? failure.message : String(failure)
        })
        .finally(() => {
          pending = undefined
        })
    },
    wait: async () => {
      await pending
    },
  }
}
