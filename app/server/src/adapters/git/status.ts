import git from "isomorphic-git"
import type { GitStatusAdapter } from "../../core/types/git.js"
import { gitContext as context, gitRevision as revision } from "./context.js"
import { nativeStatus } from "./native-index.js"
import { isMergedWorktree } from "./native-read.js"

export function createGitStatus(): GitStatusAdapter {
  return {
    isMerged: isMergedWorktree,
    async inspect(projectPath) {
      try {
        const ctx = await context(projectPath)
        const oid = await revision(ctx)
        // Host Git owns exclude/config precedence, including linked-worktree common metadata.
        const changes = await nativeStatus(ctx.root, oid)
        return {
          available: true,
          root: ctx.root,
          gitdir: ctx.gitdir,
          commonGitdir: ctx.commonGitdir,
          branch: (await git.currentBranch({ ...ctx.args, fullname: false })) ?? null,
          revision: oid,
          dirty: changes.length > 0,
          changes,
        }
      } catch (error) {
        return {
          available: false,
          reason: error instanceof Error ? error.message : "Git inspection failed",
        }
      }
    },
  }
}
