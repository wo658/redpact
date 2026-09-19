import type { Store } from "../../src/core/types/contracts.js"

export function storageTarget(store: Store, root: string) {
  store.createProject({
    id: "project",
    name: "Storage fixture",
    createdAt: "now",
    location: { kind: "directory", root },
  })
  const worktree = {
    id: "worktree",
    projectId: "project",
    createdAt: "now",
    projectRoot: root,
    checkoutRoot: root,
    gitdir: null,
  }
  store.saveWorktree(worktree)
  return {
    projectId: worktree.projectId,
    worktreeId: worktree.id,
    projectRoot: root,
    checkoutRoot: root,
  }
}
