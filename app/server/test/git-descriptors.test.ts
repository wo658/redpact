import { execFileSync } from "node:child_process"
import { closeSync, openSync } from "node:fs"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { discoverCheckouts } from "../src/adapters/git/discover.js"
import { listGitWorktrees, readGit } from "../src/adapters/git/native-read.js"

test.skipIf(process.platform !== "darwin")(
  "Git queries survive high watcher descriptor numbers",
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "redpact-git-descriptors-")))
    const descriptors: number[] = []
    try {
      execFileSync("git", ["init", root])
      for (let index = 0; index < 11000; index++) {
        descriptors.push(openSync("/dev/null", "r"))
      }
      await expect(listGitWorktrees(join(root, ".git"))).resolves.toEqual([root])
      await expect(discoverCheckouts(join(root, ".git"))).resolves.toEqual([root])
      await expect(readGit(root, ["rev-parse", "--verify", "missing"])).rejects.toMatchObject({
        code: 128,
      })
    } finally {
      for (const descriptor of descriptors) {
        closeSync(descriptor)
      }
      await rm(root, { recursive: true, force: true })
    }
  },
)
