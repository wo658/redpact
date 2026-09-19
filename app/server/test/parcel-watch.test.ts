import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const calls = vi.hoisted(() => ({
  subscriptions: [] as {
    path: string
    callback: (error: Error | null, events: { type: string; path: string }[]) => void
    options: { ignore?: (string | RegExp)[] }
    unsubscribe: ReturnType<typeof vi.fn>
  }[],
  native: [] as {
    path: string
    recursive: boolean
    changed: (event: string, filename: string) => void
  }[],
}))
vi.mock("@parcel/watcher", () => ({
  subscribe: vi.fn(async (path, callback, options) => {
    const entry = { path, callback, options, unsubscribe: vi.fn(async () => {}) }
    calls.subscriptions.push(entry)
    return entry
  }),
}))
vi.mock("node:fs", async (load) => ({
  ...(await load<typeof import("node:fs")>()),
  watch: (
    path: string,
    options: { recursive?: boolean },
    changed: (event: string, filename: string) => void,
  ) => {
    calls.native.push({ path, recursive: options.recursive ?? false, changed })
    return Object.assign(new EventEmitter(), { close: vi.fn() })
  },
}))

import { createChangeWatcher } from "../src/adapters/changes/watch.js"

afterEach(() => {
  calls.subscriptions.length = 0
  calls.native.length = 0
})

test("source roots use Parcel with native exclusions and never recursively subscribe to their broad parent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-parcel-scope-"))
  const root = join(directory, "checkout")
  await mkdir(root)
  const watcher = createChangeWatcher()
  const changed = vi.fn()
  const sub = watcher.subscribe([{ path: root, kind: "checkout" }], changed, vi.fn())
  try {
    await sub.ready
    expect(calls.subscriptions.map((entry) => entry.path)).toEqual([root])
    expect(calls.native.every((entry) => !entry.recursive)).toBe(true)
    expect(calls.subscriptions[0].options.ignore?.length).toBeGreaterThan(0)
    calls.subscriptions[0].callback(null, [
      { type: "update", path: join(root, "source.ts") },
      { type: "create", path: join(root, "node_modules", "ignored.ts") },
    ])
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([join(root, "source.ts")]))
  } finally {
    await watcher.close()
    await rm(directory, { recursive: true, force: true })
  }
})
