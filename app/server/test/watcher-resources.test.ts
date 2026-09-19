import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createChangeWatcher } from "../src/adapters/changes/watch.js"

test.skipIf(process.platform !== "darwin")(
  "multiple UI subscriptions share native directory resources instead of one descriptor per source",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "redpact-ui-watch-resources-"))
    const root = join(directory, "checkout")
    const watcher = createChangeWatcher()
    const descriptors = () =>
      execFileSync("lsof", ["-p", String(process.pid), "-Ff"], { encoding: "utf8" })
        .split("\n")
        .filter((line) => /^f\d/.test(line)).length
    try {
      await mkdir(root)
      await Promise.all(
        Array.from({ length: 200 }, (_, i) => writeFile(join(root, `source-${i}.ts`), "initial")),
      )
      const before = descriptors()
      const first = watcher.subscribe([{ path: root, kind: "checkout" }], vi.fn(), vi.fn())
      await first.ready
      const afterFirst = descriptors()
      expect(afterFirst - before).toBeLessThan(32)
      const changed = vi.fn()
      const subscribers = Array.from({ length: 8 }, () =>
        watcher.subscribe([{ path: root, kind: "checkout" }], changed, vi.fn()),
      )
      await Promise.all(subscribers.map((sub) => sub.ready))
      expect(descriptors() - afterFirst).toBeLessThan(4)
      await first.close()
      await writeFile(join(root, "source-0.ts"), "changed")
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(8), { timeout: 2500 })
    } finally {
      await watcher.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
