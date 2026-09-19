import { captureGit } from "./capture.js"

export async function readGit(root: string, args: string[]) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  )
  return (
    await captureGit(
      ["-C", root, "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
      {
        ...env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        GIT_LITERAL_PATHSPECS: "1",
      },
      4 * 1024 * 1024,
    )
  ).stdout
}

export async function listGitWorktrees(commonGitdir: string) {
  const output = await readGit(commonGitdir, ["worktree", "list", "--porcelain", "-z"])
  return output.split("\0\0").flatMap((record) => {
    const fields = record.split("\0")
    const path = fields.find((field) => field.startsWith("worktree "))
    if (!path || fields.includes("bare")) {
      return []
    }
    return [path.slice("worktree ".length)]
  })
}

export async function listGitBranches(commonGitdir: string) {
  const refs = await readGit(commonGitdir, ["for-each-ref", "--format=%(refname)", "refs/heads/"])
  return refs
    .split("\n")
    .filter(Boolean)
    .map((ref) => ref.slice("refs/heads/".length))
}

export async function isMergedWorktree(root: string, mainBranch: string) {
  let branch = ""
  try {
    branch = (await readGit(root, ["symbolic-ref", "--quiet", "HEAD"])).trim()
  } catch (error) {
    if ((error as { code?: number }).code !== 1) {
      throw error
    }
  }
  if (branch === `refs/heads/${mainBranch}`) {
    return false
  }
  const status = await readGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  if (status) {
    return false
  }
  try {
    await readGit(root, ["merge-base", "--is-ancestor", "HEAD", `refs/heads/${mainBranch}`])
    return true
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return false
    }
    throw error
  }
}
