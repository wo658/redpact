import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createChangeWatcher } from "../src/adapters/changes/watch.js"

/** Parcel의 네이티브 제외 규칙도 최신 reflog 비교 갱신을 허용해야 한다. */
test.each(["git", "git-shared"] as const)(
  "%s의 브랜치 reflog 변경을 실제로 전달한다",
  async (kind) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "redpact-parcel-reflog-")))
    const path = join(root, "logs", "refs", "heads", "feature")
    await mkdir(join(root, "logs", "refs", "heads"), { recursive: true })
    await writeFile(path, "before")
    const watcher = createChangeWatcher()
    const changed = vi.fn()
    const failed = vi.fn()
    try {
      const subscription = watcher.subscribe([{ path: root, kind }], changed, failed)
      await subscription.ready
      await writeFile(path, "after")
      await vi.waitFor(() => expect(changed).toHaveBeenCalledWith([path]), { timeout: 3000 })
      expect(failed).not.toHaveBeenCalled()
    } finally {
      await watcher.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)
