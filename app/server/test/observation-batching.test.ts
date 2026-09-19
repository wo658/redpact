import { afterEach, expect, test, vi } from "vitest"

const watch = vi.hoisted(() => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const watcher = {
    add: vi.fn(),
    unwatch: vi.fn(),
    close: vi.fn(),
    on(event: string, handler: (...args: never[]) => void) {
      handlers.set(event, handler)
    },
    once(event: string, handler: () => void) {
      if (event === "ready") {
        queueMicrotask(handler)
      }
    },
  }
  return {
    watcher,
    emit: (path: string) => handlers.get("all")?.("change" as never, path as never),
  }
})
vi.mock("node:fs/promises", () => ({ readFile: async () => "{}" }))
vi.mock("../src/adapters/changes/file-watch.js", () => ({
  FileWatch: class {
    add = watch.watcher.add
    unwatch = watch.watcher.unwatch
    close = watch.watcher.close
    on = watch.watcher.on
    once = watch.watcher.once
  },
}))

import { observeProjectFiles } from "../src/adapters/changes/projects.js"

afterEach(() => vi.useRealTimers())

test("project events share a one-second window and one pending refresh during a slow observation", async () => {
  vi.useFakeTimers()
  let release: (() => void) | undefined
  const observe = vi.fn(async () => ({ watchPaths: ["/repo"], issues: [] }))
  const observer = await observeProjectFiles({
    settingsPath: "/runtime/settings.json",
    defaults: ["/repo"],
    observe,
    report: () => {},
  })
  try {
    observe.mockClear()
    watch.emit("/repo/a.test.ts")
    await vi.advanceTimersByTimeAsync(500)
    watch.emit("/repo/b.test.ts")
    await vi.advanceTimersByTimeAsync(499)
    expect(observe).not.toHaveBeenCalled()
    observe.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { watchPaths: ["/repo"], issues: [] }
    })
    await vi.advanceTimersByTimeAsync(1)
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      ["/repo"],
      ["/repo/a.test.ts", "/repo/b.test.ts"],
      expect.any(AbortSignal),
    )
    for (let index = 0; index < 5; index++) {
      watch.emit("/repo/c.test.ts")
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(observe).toHaveBeenCalledTimes(1)
    release?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(observe).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenLastCalledWith(
      ["/repo"],
      ["/repo/c.test.ts"],
      expect.any(AbortSignal),
    )
  } finally {
    release?.()
    await observer.close()
  }
})

test("closing project observation cancels active stabilization and discards pending refreshes", async () => {
  vi.useFakeTimers()
  const { stableTestInputs } = await import("../src/workflows/observe-test-inputs.js")
  const report = vi.fn()
  const read = vi.fn(async () => "same")
  const observe = vi.fn(async (_paths: string[], _changed?: string[], signal?: AbortSignal) => {
    if (_changed) {
      await stableTestInputs("same", read, signal)
    }
    return { watchPaths: ["/repo"], issues: [] }
  })
  const observer = await observeProjectFiles({
    settingsPath: "/runtime/settings.json",
    defaults: ["/repo"],
    observe,
    report,
  })
  watch.emit("/repo/first.ts")
  await vi.advanceTimersByTimeAsync(1000)
  watch.emit("/repo/second.ts")
  let closed = false
  const closing = observer.close().then(() => {
    closed = true
  })
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(closed).toBe(true)
    expect(read).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenCalledTimes(1)
  } finally {
    await vi.advanceTimersByTimeAsync(4000)
    await closing
  }
})

test("nonblocking startup returns the close handle while initial observation is pending and reports eventual results", async () => {
  vi.useFakeTimers()
  let release: (() => void) | undefined
  const report = vi.fn()
  const observe = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return { watchPaths: ["/repo"], issues: [{ path: "/repo", message: "Configure settings" }] }
  })
  let initialized = false
  const pending = observeProjectFiles({
    settingsPath: "/runtime/settings.json",
    defaults: ["/repo"],
    observe,
    report,
    waitForInitial: false,
  }).then((observer) => {
    initialized = true
    return observer
  })
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(initialized).toBe(true)
    expect(report).not.toHaveBeenCalled()
    release?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledWith([{ path: "/repo", message: "Configure settings" }])
  } finally {
    release?.()
    await vi.advanceTimersByTimeAsync(0)
    await (await pending).close()
  }
})

test("nonblocking startup can close during its first sample without reporting a configuration failure", async () => {
  vi.useFakeTimers()
  const { stableTestInputs } = await import("../src/workflows/observe-test-inputs.js")
  const report = vi.fn()
  const read = vi.fn(async () => "same")
  const observer = await observeProjectFiles({
    settingsPath: "/runtime/settings.json",
    defaults: ["/repo"],
    waitForInitial: false,
    report,
    observe: async (_paths, _changed, signal) => {
      await stableTestInputs("same", read, signal)
      return { watchPaths: ["/repo"], issues: [] }
    },
  })
  await vi.advanceTimersByTimeAsync(0)
  await observer.close()
  expect(read).not.toHaveBeenCalled()
  expect(report).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
