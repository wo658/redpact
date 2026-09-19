import { stat } from "node:fs/promises"
import type { GitBranchAdapter } from "../../core/types/git.js"
import { readGit } from "./native-read.js"

export function createGitBranches(): GitBranchAdapter {
  return {
    async branchReviews(root, mainBranch) {
      const [refs, entries, merged] = await Promise.all([
        readGit(root, ["for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads/"]),
        readGit(root, ["worktree", "list", "--porcelain", "-z"]),
        mainBranch
          ? readGit(root, [
              "for-each-ref",
              `--merged=refs/heads/${mainBranch}`,
              "--format=%(refname)",
              "refs/heads/",
            ]).catch(() => "")
          : Promise.resolve(""),
      ])
      const mergedNames = new Set(merged.trim().split("\n"))
      const worktrees = await Promise.all(
        entries
          .split("\0\0")
          .filter(Boolean)
          .map(async (entry) => {
            const fields = entry.split("\0")
            const path = fields.find((field) => field.startsWith("worktree "))?.slice(9) ?? ""
            const branch = fields.find((field) => field.startsWith("branch refs/heads/"))?.slice(18)
            const exists =
              path &&
              (await stat(path)
                .then((s) => s.isDirectory())
                .catch(() => false))
            return { branch, path, missing: !exists }
          }),
      )
      return refs
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((ref) => {
          const [fullName, revision] = ref.split("\0")
          const name = fullName.slice("refs/heads/".length)
          return {
            name,
            revision,
            merged: name !== mainBranch && mergedNames.has(fullName),
            worktrees: worktrees
              .filter((w) => w.branch === name)
              .map(({ path, missing }) => ({ path, missing })),
          }
        })
    },
    async branchDiff(root, branch, mainBranch) {
      const revision = (
        await readGit(root, ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])
      ).trim()
      if (!mainBranch) {
        return {
          available: false,
          revision,
          reason: "Choose a main branch to compare committed changes.",
          patch: "",
          omitted: [],
        }
      }
      const main = (
        await readGit(root, ["rev-parse", "--verify", `refs/heads/${mainBranch}^{commit}`])
      ).trim()
      const baseRevision = (await readGit(root, ["merge-base", main, revision])).trim()
      const patch = await readGit(root, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        baseRevision,
        revision,
        "--",
        ".",
      ])
      return { available: true, revision, baseRevision, patch, omitted: [] }
    },
  }
}
