import { afterEach, expect, test, vi } from "vitest"
import { createObserveProjects } from "../src/workflows/observe-projects.js"

afterEach(() => vi.useRealTimers())

test("cancelling a stability sample stops before remaining checkouts and publishes no inputs", async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const ensure = vi.fn(async (_project: string, root: string) => ({ id: root, gitdir: null }))
  const submitObserved = vi.fn()
  const readTests = vi.fn(async () => [{ path: "a.test.ts", source: "// initial" }])
  const observe = createObserveProjects({
    worktrees: {
      connect: async () => ({
        id: "project",
        location: { kind: "git", commonGitdir: "/repo/.git", projectPath: "." },
      }),
      ensure,
      resolve: async () => ({
        settings: {
          read: async () => ({ valid: true, settings: { tests: { directory: "tests" } } }),
        },
      }),
    } as never,
    files: { readTests } as never,
    submissions: { latest: () => undefined, submitObserved } as never,
    checkouts: async () => ["/repo", "/linked-one", "/linked-two"],
  })
  let finished = false
  const pending = observe(["/repo"], undefined, controller.signal)
    .catch((error: unknown) => error)
    .finally(() => {
      finished = true
    })
  await vi.advanceTimersByTimeAsync(0)
  expect(readTests).toHaveBeenCalledOnce()
  controller.abort()
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(finished).toBe(true)
    expect(await pending).toMatchObject({ name: "AbortError" })
    expect(ensure).toHaveBeenCalledTimes(1)
    expect(submitObserved).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    await vi.runAllTimersAsync()
    await pending
  }
})
