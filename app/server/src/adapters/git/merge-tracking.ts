import { readGit } from "./native-read.js"

export function createMergeTrackingGit() {
  return {
    async origin(root: string) {
      return (await readGit(root, ["remote", "get-url", "--all", "origin"])).trim()
    },
    async revision(root: string, branch: string) {
      return (
        await readGit(root, ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])
      ).trim()
    },
    async contains(root: string, commit: string, branch: string) {
      try {
        await readGit(root, ["merge-base", "--is-ancestor", commit, `refs/heads/${branch}`])
        return true
      } catch (error) {
        if ((error as { code?: number }).code === 1) {
          return false
        }
        throw error
      }
    },
  }
}
