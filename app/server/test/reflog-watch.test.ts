import { EventEmitter } from "node:events"
import { expect, test, vi } from "vitest"

const captured = vi.hoisted(() => ({ ignored: (_path: string): boolean => false }))
vi.mock("../src/adapters/changes/file-watch.js", () => ({
  FileWatch: class extends EventEmitter {
    constructor(_paths: string[], ignored: (path: string) => boolean) {
      super()
      captured.ignored = ignored
      queueMicrotask(() => this.emit("ready"))
    }
    async close() {}
  },
}))

import { createChangeWatcher } from "../src/adapters/changes/watch.js"

/** 브랜치 reflog 만료도 비교 화면을 갱신하되 원격 및 HEAD 로그는 감시하지 않는다. */
test.each(["git", "git-shared"] as const)(
  "%s 감시는 로컬 브랜치 reflog 변경을 포함한다",
  async (kind) => {
    const watcher = createChangeWatcher()
    try {
      const subscription = watcher.subscribe([{ path: "/repo/.git", kind }], vi.fn(), vi.fn())
      await subscription.ready
      expect(captured.ignored("/repo/.git/logs")).toBe(false)
      expect(captured.ignored("/repo/.git/logs/refs")).toBe(false)
      expect(captured.ignored("/repo/.git/logs/refs/heads/feature")).toBe(false)
      expect(captured.ignored("/repo/.git/logs/refs/heads/nested/feature")).toBe(false)
      expect(captured.ignored("/repo/.git/logs/HEAD")).toBe(true)
      expect(captured.ignored("/repo/.git/logs/refs/remotes/origin/main")).toBe(true)
      expect(captured.ignored("/repo/.git/objects/aa/bb")).toBe(true)
    } finally {
      await watcher.close()
    }
  },
)
