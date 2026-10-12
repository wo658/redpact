import type { Worktree } from "./api"

export function worktreeName(worktree: Pick<Worktree, "checkoutRoot" | "branch">) {
  if (worktree.branch) {
    return worktree.branch
  }
  return worktree.checkoutRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? worktree.checkoutRoot
}
