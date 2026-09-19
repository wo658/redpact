import * as fs from "node:fs"
import { realpath } from "node:fs/promises"
import { dirname } from "node:path"
import git from "isomorphic-git"
import type { GitMetadataAdapter } from "../../core/types/git.js"
import { gitContext, gitRevision } from "./context.js"
import { listGitWorktrees } from "./native-read.js"

export function createGitMetadata(): GitMetadataAdapter {
  return {
    async metadata(path) {
      try {
        const ctx = await gitContext(path)
        await gitRevision(ctx)
        const { root, gitdir, commonGitdir } = ctx
        return { available: true, root, gitdir, commonGitdir }
      } catch (error) {
        return {
          available: false,
          reason: error instanceof Error ? error.message : "Git metadata unavailable",
        }
      }
    },
    async primaryRoot(commonGitdir) {
      const common = await realpath(commonGitdir)
      const ctx = await gitContext(dirname(common))
      if (ctx.gitdir !== common || ctx.commonGitdir !== common) {
        throw new Error("The project's primary checkout is unavailable")
      }
      return ctx.root
    },
    async currentBranch(path) {
      return (await git.currentBranch((await gitContext(path)).args)) ?? null
    },
    async listBranches(commonGitdir) {
      return git.listBranches({ fs, gitdir: commonGitdir })
    },
    listWorktrees: listGitWorktrees,
  }
}
