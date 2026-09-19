import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { expect, test, vi } from "vitest"
import { createChangeWatcher } from "../src/adapters/changes/watch.js"

test("native file events cover untracked files, atomic saves, private index and runtime records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redpact-events-"))
  const paths = ["checkout", "private-git", "common-git", "runtime"]
  await Promise.all(paths.map((path) => mkdir(join(dir, path))))
  const changes = createChangeWatcher()
  const changed = vi.fn()
  const failed = vi.fn()
  const subscription = changes.subscribe(
    [
      { path: join(dir, "checkout"), kind: "checkout" },
      { path: join(dir, "private-git"), kind: "git" },
      { path: join(dir, "common-git"), kind: "git" },
      { path: join(dir, "runtime"), kind: "runtime" },
    ],
    changed,
    failed,
  )
  try {
    await subscription.ready
    expect(changed).not.toHaveBeenCalled()
    const observe = async (operation: () => Promise<unknown>) => {
      changed.mockClear()
      await operation()
      await vi.waitFor(() => expect(changed, String(operation)).toHaveBeenCalled(), {
        timeout: 2500,
      })
      await delay(250)
    }
    await observe(() => writeFile(join(dir, "checkout", "untracked.txt"), "new"))
    await observe(async () => {
      await writeFile(join(dir, "checkout", "save.tmp"), "replacement")
      await rename(join(dir, "checkout", "save.tmp"), join(dir, "checkout", "untracked.txt"))
    })
    await observe(() => rm(join(dir, "checkout", "untracked.txt")))
    await observe(() => writeFile(join(dir, "private-git", "index"), "staged"))
    await observe(async () => {
      await mkdir(join(dir, "common-git", "refs", "heads"), { recursive: true })
      await writeFile(join(dir, "common-git", "refs", "heads", "main"), "commit")
    })
    await observe(async () => {
      await mkdir(join(dir, "runtime", "runs", "run1"), { recursive: true })
      await writeFile(join(dir, "runtime", "runs", "run1", "state.json"), "finished")
    })
    await observe(async () => {
      await mkdir(join(dir, "common-git", "worktrees", "external"), { recursive: true })
      await writeFile(join(dir, "common-git", "worktrees", "external", "gitdir"), "/checkout/.git")
    })
    changed.mockClear()
    await mkdir(join(dir, "checkout", "node_modules"))
    await writeFile(join(dir, "checkout", "node_modules", "noise"), "ignored")
    await delay(400)
    expect(changed).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
    await subscription.close()
    await writeFile(join(dir, "checkout", "after-close"), "no event")
    await delay(200)
    expect(changed).not.toHaveBeenCalled()
  } finally {
    await changes.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("watcher does not follow symlinks and shutdown notifies subscribers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redpact-events-links-"))
  await mkdir(join(dir, "checkout"))
  await mkdir(join(dir, "outside"))
  await symlink(join(dir, "outside"), join(dir, "checkout", "link"))
  const changes = createChangeWatcher()
  const changed = vi.fn(),
    failed = vi.fn()
  try {
    const sub = changes.subscribe(
      [{ path: join(dir, "checkout"), kind: "checkout" }],
      changed,
      failed,
    )
    await sub.ready
    await writeFile(join(dir, "outside", "secret"), "outside")
    await delay(350)
    expect(changed).not.toHaveBeenCalled()
    await changes.close()
    expect(failed).toHaveBeenCalledOnce()
  } finally {
    await changes.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("checkout Git scopes exclude sibling indexes and evidence records exclude logs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redpact-scoped-events-"))
  const common = join(dir, "git")
  const own = join(common, "worktrees", "own")
  const other = join(common, "worktrees", "other")
  const runs = join(dir, "runs")
  await Promise.all(
    [own, other, join(common, "refs", "heads"), join(runs, "run1")].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  )
  const changes = createChangeWatcher()
  const changed = vi.fn()
  const subscription = changes.subscribe(
    [
      { path: own, kind: "git-private" },
      { path: common, kind: "git-shared" },
      { path: runs, kind: "records" },
    ],
    changed,
    vi.fn(),
  )
  try {
    await subscription.ready
    await writeFile(join(other, "index"), "other staging")
    await writeFile(join(runs, "run1", "stdout.log"), "output")
    await delay(350)
    expect(changed).not.toHaveBeenCalled()
    const state = join(runs, "run1", "state.json")
    await writeFile(state, "finished")
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([state]))
    changed.mockClear()
    const index = join(own, "index")
    await writeFile(index, "own staging")
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([index]))
    changed.mockClear()
    const ref = join(common, "refs", "heads", "local")
    await writeFile(ref, "new commit")
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([ref]))
  } finally {
    await changes.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("checkout watches follow directory deletion and restoration", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "redpact-root-events-")))
  const root = join(dir, "checkout")
  await mkdir(root)
  const watcher = createChangeWatcher()
  const changed = vi.fn()
  const failed = vi.fn()
  const subscription = watcher.subscribe([{ path: root, kind: "checkout" }], changed, failed)
  try {
    await subscription.ready
    await writeFile(join(root, "probe"), "watch is active")
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2500 })
    changed.mockClear()
    await rm(root, { recursive: true })
    await vi.waitFor(
      () =>
        expect(changed, "directory deletion").toHaveBeenCalledWith(expect.arrayContaining([root])),
      { timeout: 2500 },
    )
    changed.mockClear()
    await mkdir(root)
    await vi.waitFor(
      () =>
        expect(changed, "directory restoration").toHaveBeenCalledWith(
          expect.arrayContaining([root]),
        ),
      { timeout: 2500 },
    )
    expect(failed).not.toHaveBeenCalled()
  } finally {
    await watcher.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("initially missing nested roots and renamed replacements retain source watches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redpact-missing-events-"))
  const root = join(dir, "missing", "checkout")
  const watcher = createChangeWatcher()
  const changed = vi.fn()
  const subscription = watcher.subscribe([{ path: root, kind: "checkout" }], changed, vi.fn())
  try {
    await subscription.ready
    await mkdir(root, { recursive: true })
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(expect.arrayContaining([root])), {
      timeout: 2500,
    })
    changed.mockClear()
    await writeFile(join(root, "first.ts"), "created")
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2500 })
    await rename(root, join(dir, "old"))
    await mkdir(root)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(expect.arrayContaining([root])), {
      timeout: 2500,
    })
    changed.mockClear()
    await writeFile(join(root, "second.ts"), "replacement")
    await vi.waitFor(
      () => expect(changed).toHaveBeenCalledWith(expect.arrayContaining([join(root, "second.ts")])),
      { timeout: 2500 },
    )
  } finally {
    await watcher.close()
    await rm(dir, { recursive: true, force: true })
  }
})
