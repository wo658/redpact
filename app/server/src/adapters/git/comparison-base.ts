import { captureGit } from "./capture.js"
import { branchCreation } from "./reflog.js"

export async function comparisonBase(
  root: string,
  revision: string | null,
  mainBranch: string | null,
  env: NodeJS.ProcessEnv,
) {
  if (!revision) {
    throw new Error("A committed HEAD is required for worktree comparison")
  }
  const creation = await branchCreation(root, revision, mainBranch, env)
  if (creation) {
    return creation
  }
  if (!mainBranch) {
    throw new Error("A main branch and committed HEAD are required for worktree comparison")
  }
  const branch = await captureGit(
    ["-C", root, "rev-parse", "--verify", "--end-of-options", `refs/heads/${mainBranch}^{commit}`],
    env,
    4096,
  )
  const bases = await captureGit(
    ["-C", root, "merge-base", "--all", revision, branch.stdout.trim()],
    env,
    4096,
  )
  const revisions = bases.stdout.trim().split(/\s+/)
  if (revisions.length !== 1 || !/^[a-f0-9]{40,64}$/.test(revisions[0] ?? "")) {
    throw new Error("Worktree comparison requires one common ancestor")
  }
  return revisions[0]
}
