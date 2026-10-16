import { readGit } from "./native-read.js"

export async function executionChanges(root: string, mainBranch: string | null) {
  if (!mainBranch) {
    throw new Error("Changed execution requires a configured main branch")
  }
  const main = (
    await readGit(root, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `refs/heads/${mainBranch}^{commit}`,
    ])
  ).trim()
  const baseRevision = (await readGit(root, ["merge-base", "--all", "HEAD", main])).trim()
  if (!/^[a-f0-9]{40,64}$/.test(baseRevision)) {
    throw new Error("Changed execution requires one Git comparison base")
  }
  const prefix = (await readGit(root, ["rev-parse", "--show-prefix"])).replace(/\n$/, "")
  const [committed, staged, unstaged, untracked] = await Promise.all([
    readGit(root, ["diff", "--name-only", "--no-renames", "-z", baseRevision, "HEAD", "--", "."]),
    readGit(root, ["diff", "--cached", "--name-only", "--no-renames", "-z", "--", "."]),
    readGit(root, ["diff", "--name-only", "--no-renames", "-z", "--", "."]),
    readGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."]),
  ])
  const tracked = [committed, staged, unstaged].flatMap((value) =>
    value
      .split("\0")
      .filter((path) => path && path.startsWith(prefix))
      .map((path) => path.slice(prefix.length)),
  )
  return {
    baseRevision,
    paths: [...new Set([...tracked, ...untracked.split("\0").filter(Boolean)])].sort(),
  }
}
