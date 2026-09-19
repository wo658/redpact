import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { openStore } from "../src/adapters/storage/files.js"
import type { SourceFile } from "../src/core/types/contracts.js"
import { createObserveProjects } from "../src/workflows/observe-projects.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { storageTarget } from "./helpers/storage.js"

const cleanup: (() => void)[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const close of cleanup.splice(0).reverse()) {
    close()
  }
})
function fixture(read: (root?: string, directory?: string) => Promise<SourceFile[]>) {
  vi.useFakeTimers()
  const root = mkdtempSync(join(tmpdir(), "redpact-observation-publication-"))
  const storage = openStore(join(root, "state"))
  cleanup.push(() => {
    storage.close()
    rmSync(root, { recursive: true, force: true })
  })
  const target = storageTarget(storage.store, root)
  const worktree = storage.store.getWorktree(target.worktreeId)
  const project = storage.store.getProject(target.projectId)
  if (!worktree || !project) {
    throw new Error("Missing fixture identity")
  }
  const settings = {
    read: vi.fn(async () => ({ valid: true, settings: { tests: { directory: "tests" } } })),
  }
  const worktrees = {
    connect: async () => project,
    ensure: async () => worktree,
    resolve: async () => ({ worktree, settings }),
  }
  const parse = vi.fn(() => ({ scenarios: [], limitations: [] }))
  const submissions = createSubmissions({
    store: storage.store,
    worktrees: worktrees as never,
    runnerVersion: "test",
    parse,
  })
  const readTests = vi.fn(read)
  const observe = createObserveProjects({
    worktrees: worktrees as never,
    submissions,
    files: { readTests, settings: () => settings } as never,
    checkouts: async () => [],
  })
  async function run() {
    const pending = observe([root])
    await vi.runAllTimersAsync()
    return pending
  }
  return { root, store: storage.store, readTests, readSettings: settings.read, parse, run, observe }
}
const source = (version: string): SourceFile[] => [
  { path: "a.test.ts", source: `// a ${version}` },
  { path: "b.test.ts", source: `// b ${version}` },
]

test("invalid observed packages do not leave work items across repeated source events", async () => {
  const f = fixture(async () => [...source("one"), { path: "package.json", source: "{}" }])
  expect((await f.run()).issues).toHaveLength(1)
  expect((await f.run()).issues).toHaveLength(1)
  expect(f.store.listWorkItems()).toHaveLength(0)
  expect(f.store.listSubmissions()).toHaveLength(0)
})

test("observation publishes only after a complete input bundle stays unchanged", async () => {
  const mixed = [source("old")[0], source("new")[1]]
  let reads = 0
  const f = fixture(async () => (++reads === 1 ? mixed : source("new")))
  expect((await f.run()).issues).toEqual([])
  expect(f.store.listSubmissions()[0]?.files).toEqual(source("new"))
  expect(f.readTests.mock.calls.length).toBeGreaterThanOrEqual(3)
})

test("continuous writes are bounded and cannot publish an unstable bundle", async () => {
  let reads = 0
  const f = fixture(async () => source(String(++reads)))
  const result = await f.run()
  expect(result.issues[0]?.message).toContain("changed while being observed")
  expect(f.readTests.mock.calls.length).toBeLessThanOrEqual(4)
  expect(f.store.listWorkItems()).toHaveLength(0)
  expect(f.store.listSubmissions()).toHaveLength(0)
})

test("concurrent observation of the same stable inputs creates one work item and submission", async () => {
  const f = fixture(async () => source("one"))
  const pending = Promise.all([f.observe([f.root]), f.observe([f.root])])
  await vi.runAllTimersAsync()
  expect((await pending).flatMap((result) => result.issues)).toEqual([])
  expect(f.store.listWorkItems()).toHaveLength(1)
  expect(f.store.listSubmissions()).toHaveLength(1)
})

test("settings changes during sampling cannot publish sources from the former directory", async () => {
  const f = fixture(async (_root, directory) => source(directory ?? "unknown"))
  const configured = (directory: string) => ({ valid: true, settings: { tests: { directory } } })
  f.readSettings.mockResolvedValueOnce(configured("old")).mockResolvedValue(configured("new"))
  expect((await f.run()).issues).toEqual([])
  expect(f.store.listSubmissions()[0]?.files).toEqual(source("new"))
  expect(f.store.listWorkItems()[0]?.intent).toContain("new")
  expect(f.readTests.mock.calls.length).toBeGreaterThanOrEqual(3)
})

test("invalid settings during sampling publish nothing and a repaired event can retry", async () => {
  const f = fixture(async () => source("one"))
  f.readSettings
    .mockResolvedValueOnce({ valid: true, settings: { tests: { directory: "tests" } } })
    .mockResolvedValueOnce({ valid: false, settings: { tests: { directory: "tests" } } })
  expect((await f.run()).issues[0]?.message).toContain("settings are missing or invalid")
  expect(f.store.listWorkItems()).toHaveLength(0)
  expect(f.store.listSubmissions()).toHaveLength(0)
  expect((await f.run()).issues).toEqual([])
  expect(f.store.listWorkItems()).toHaveLength(1)
  expect(f.store.listSubmissions()).toHaveLength(1)
})

test("unchanged already-published inputs skip the stability delay and second source read", async () => {
  const f = fixture(async () => source("one"))
  await f.run()
  f.readTests.mockClear()
  f.parse.mockClear()
  const before = Date.now()
  expect((await f.run()).issues).toEqual([])
  expect(f.readTests).toHaveBeenCalledTimes(1)
  expect(Date.now()).toBe(before)
  expect(f.parse).not.toHaveBeenCalled()
  expect(f.store.listWorkItems()).toHaveLength(1)
  expect(f.store.listSubmissions()).toHaveLength(1)
})

test("parser failure happens before observation publishes either record", async () => {
  const f = fixture(async () => source("one"))
  f.parse.mockImplementation(() => {
    throw new Error("Cannot parse observed source")
  })
  expect((await f.run()).issues[0]?.message).toContain("Cannot parse observed source")
  expect(f.store.listWorkItems()).toHaveLength(0)
  expect(f.store.listSubmissions()).toHaveLength(0)
})

test("repairing newly configured Compose inputs retries after invalid settings during sampling", async () => {
  const f = fixture(async (_root, directory) => source(directory ?? "unknown"))
  const configured = (directory: string, valid = true) => ({
    valid,
    settings: { tests: { directory }, composeFiles: [`${directory}.yaml`] },
  })
  f.readSettings
    .mockResolvedValueOnce(configured("old"))
    .mockResolvedValueOnce(configured("new", false))
    .mockResolvedValue(configured("new"))
  expect((await f.run()).issues).toHaveLength(1)
  expect(f.store.listSubmissions()).toHaveLength(0)
  const pending = f.observe([f.root], [join(f.root, "new.yaml")])
  await vi.runAllTimersAsync()
  expect((await pending).issues).toEqual([])
  expect(f.store.listSubmissions()[0]?.files).toEqual(source("new"))
})

test("invalid settings syntax retains previously known custom input paths for repair events", async () => {
  const f = fixture(async () => source("one"))
  f.readSettings.mockResolvedValue({
    valid: true,
    settings: { tests: { directory: "custom-tests" } },
  })
  await f.run()
  f.readSettings.mockResolvedValue({ valid: false, settings: undefined as never })
  const invalid = f.observe([f.root], [join(f.root, ".redpact/settings.json")])
  await vi.runAllTimersAsync()
  expect((await invalid).issues).toHaveLength(1)
  f.readSettings.mockClear()
  const repair = f.observe([f.root], [join(f.root, "custom-tests/a.test.ts")])
  await vi.runAllTimersAsync()
  expect((await repair).issues).toHaveLength(1)
  expect(f.readSettings).toHaveBeenCalledTimes(1)
})
