import { isDeepStrictEqual } from "node:util"

// Consecutive samples reduce partial-save observations; filesystem reads are not transactions.
export async function stableTestInputs<T>(
  initial: T,
  read: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let previous = initial
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort)
        resolve()
      }, 1000)
      signal?.addEventListener("abort", abort, { once: true })
    })
    signal?.throwIfAborted()
    const current = await read()
    signal?.throwIfAborted()
    if (isDeepStrictEqual(previous, current)) {
      return current
    }
    previous = current
  }
  throw new Error("Test inputs changed while being observed; waiting for the next file change")
}
