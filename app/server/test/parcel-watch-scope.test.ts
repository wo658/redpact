import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"

const capture = vi.hoisted(() => ({
  calls: [] as {
    path: string
    recursive: boolean
    watcher: { close: ReturnType<typeof vi.fn> }
    changed: (event: string, filename: string) => void
  }[],
}))
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  watch: (
    path: string,
    options: { recursive: boolean },
    changed: (event: string, filename: string) => void,
  ) => {
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn() })
    capture.calls.push({ path, recursive: options.recursive, watcher, changed })
    return watcher
  },
}))

vi.mock("@parcel/watcher", () => ({
  subscribe: async (path: string) => {
    const watcher = { close: vi.fn() }
    capture.calls.push({ path, recursive: true, watcher, changed: () => {} })
    return {
      unsubscribe: async () => {
        watcher.close()
      },
    }
  },
}))

import { ParcelProjectWatch } from "../src/adapters/changes/parcel-project-watch.js"

test("Parcel roots never recursively watch a broad parent and share overlapping recursive targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-native-scope-"))
  const root = join(directory, "checkout")
  await mkdir(join(root, "tests"), { recursive: true })
  capture.calls.length = 0
  const watcher = new ParcelProjectWatch(root, () => false)
  await new Promise<void>((resolve) => watcher.once("ready", resolve))
  try {
    watcher.add(join(root, "tests"))
    await new Promise((resolve) => setImmediate(resolve))
    expect(capture.calls.filter((call) => call.recursive).map((call) => call.path)).toEqual([root])
    expect(capture.calls.find((call) => call.path === directory)?.recursive).toBe(false)
  } finally {
    await watcher.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("delayed parent rename events preserve a live root handle until the directory identity actually changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-native-identity-"))
  const root = join(directory, "runs")
  await mkdir(root)
  capture.calls.length = 0
  const watcher = new ParcelProjectWatch(root, () => false)
  await new Promise<void>((resolve) => watcher.once("ready", resolve))
  try {
    const recursive = capture.calls.find((call) => call.path === root)
    const parent = capture.calls.find((call) => call.path === directory)
    parent?.changed("rename", "runs")
    await new Promise((resolve) => setImmediate(resolve))
    expect(recursive?.watcher.close).not.toHaveBeenCalled()
    expect(capture.calls.filter((call) => call.path === root)).toHaveLength(1)
    await rename(root, join(directory, "previous-runs"))
    await mkdir(root)
    parent?.changed("rename", "runs")
    await new Promise((resolve) => setImmediate(resolve))
    expect(recursive?.watcher.close).toHaveBeenCalledOnce()
    expect(capture.calls.filter((call) => call.path === root)).toHaveLength(2)
  } finally {
    await watcher.close()
    await rm(directory, { recursive: true, force: true })
  }
})
