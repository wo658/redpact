import { EventEmitter } from "node:events"
import { afterEach, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  watchers: [] as (EventEmitter & { close: ReturnType<typeof vi.fn> })[],
}))
vi.mock("../src/adapters/changes/parcel-project-watch.js", () => ({
  ParcelProjectWatch: class extends EventEmitter {
    close = vi.fn(async () => {})
    add = vi.fn()
    unwatch = vi.fn()
    constructor() {
      super()
      state.watchers.push(this)
      queueMicrotask(() => this.emit("ready"))
    }
  },
}))

import { createChangeWatcher } from "../src/adapters/changes/watch.js"

afterEach(() => {
  vi.useRealTimers()
  state.watchers.length = 0
})

test("watch failures close their handle, recover once with backoff, and invalidate every subscriber", async () => {
  vi.useFakeTimers()
  const watcher = createChangeWatcher()
  const changed = vi.fn(),
    failed = vi.fn()
  const sub = watcher.subscribe([{ path: "/repo", kind: "checkout" }], changed, failed)
  await sub.ready
  try {
    const first = state.watchers[0]
    first.emit("error", new Error("temporary resource exhaustion"))
    await vi.advanceTimersByTimeAsync(999)
    expect(first.close).toHaveBeenCalledOnce()
    expect(state.watchers).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.watchers).toHaveLength(2)
    expect(changed).toHaveBeenCalledWith(["/repo"])
    expect(failed).not.toHaveBeenCalled()
    const count = changed.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(changed).toHaveBeenCalledTimes(count)
    expect(state.watchers).toHaveLength(2)
    state.watchers[1].emit("error", new Error("retry later"))
    await sub.close()
    await vi.advanceTimersByTimeAsync(60000)
    expect(state.watchers).toHaveLength(2)
  } finally {
    await watcher.close()
  }
})

test("ready then immediately failing watchers exhaust bounded retries instead of restarting forever", async () => {
  vi.useFakeTimers()
  const watcher = createChangeWatcher()
  const failed = vi.fn()
  const sub = watcher.subscribe([{ path: "/repo", kind: "checkout" }], vi.fn(), failed)
  await sub.ready
  try {
    for (let index = 0; index < 6; index++) {
      state.watchers.at(-1)?.emit("error", new Error("persistent failure after ready"))
      await vi.advanceTimersByTimeAsync(10000)
    }
    expect(failed).toHaveBeenCalledOnce()
    expect(state.watchers).toHaveLength(6)
    await vi.advanceTimersByTimeAsync(60000)
    expect(state.watchers).toHaveLength(6)
  } finally {
    await sub.close()
    await watcher.close()
  }
})

test("a rejected handle close reports terminal failure and never leaks replacement handles", async () => {
  vi.useFakeTimers()
  const watcher = createChangeWatcher()
  const failed = vi.fn()
  const sub = watcher.subscribe([{ path: "/repo", kind: "checkout" }], vi.fn(), failed)
  await sub.ready
  try {
    state.watchers[0].close.mockRejectedValueOnce(new Error("cannot release handle"))
    state.watchers[0].emit("error", new Error("watch error"))
    await vi.advanceTimersByTimeAsync(60000)
    expect(failed).toHaveBeenCalledOnce()
    expect(state.watchers).toHaveLength(1)
  } finally {
    await sub.close()
    await watcher.close()
  }
})
