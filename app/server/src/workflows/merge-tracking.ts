import PQueue from "p-queue"
import type { BranchReview, GitAdapter } from "../core/types/git.js"
import type {
  GitHubMergeTracking,
  MergedPullRequest,
  MergeTracking,
} from "../core/types/merge-tracking.js"

export function createMergeTracking(deps: {
  git: Pick<GitAdapter, "inspect" | "isMerged">
  contains(root: string, commit: string, branch: string): Promise<boolean>
  revision(root: string, branch: string): Promise<string>
  github: GitHubMergeTracking
  origin(root: string): Promise<string>
  now(): number
}): MergeTracking {
  const queue = new PQueue({ concurrency: 4 })
  const requests = new Map<string, { expires: number; result: Promise<MergedPullRequest | null> }>()
  async function evidence(root: string, branch: string, head: string, base: string) {
    const origin = await deps.origin(root)
    const key = JSON.stringify([root, origin, branch, head, base])
    const cached = requests.get(key)
    if (cached && cached.expires > deps.now()) {
      return { pr: await cached.result, origin }
    }
    // Cache only remote evidence; local heads, ancestry and dirty state stay live.
    const result = queue
      .add(() => deps.github.merged(root, branch, head, base, origin))
      .catch(() => null)
    requests.delete(key)
    requests.set(key, { expires: deps.now() + 30000, result })
    if (requests.size > 256) {
      const oldest = requests.keys().next().value
      if (oldest !== undefined) {
        requests.delete(oldest)
      }
    }
    return { pr: await result, origin }
  }
  async function mergedBranch(root: string, branch: string, head: string, main: string) {
    const target = await deps.revision(root, main)
    const { pr, origin } = await evidence(root, branch, head, main)
    if (!pr || !(await deps.contains(root, pr.mergeCommit, main))) {
      return false
    }
    const [currentHead, currentTarget, currentOrigin] = await Promise.all([
      deps.revision(root, branch),
      deps.revision(root, main),
      deps.origin(root),
    ])
    return currentHead === head && currentTarget === target && currentOrigin === origin
  }
  async function branch(root: string, row: BranchReview, main: string) {
    if (row.merged || row.name === main) {
      return row
    }
    const merged = await mergedBranch(root, row.name, row.revision, main).catch(() => false)
    return { ...row, merged }
  }
  return {
    async isMerged(root, mainBranch) {
      if (await deps.git.isMerged(root, mainBranch)) {
        return true
      }
      const source = await deps.git.inspect(root)
      if (
        !source.available ||
        source.dirty ||
        !source.branch ||
        !source.revision ||
        source.branch === mainBranch
      ) {
        return false
      }
      const target = await deps.revision(root, mainBranch)
      const { pr, origin } = await evidence(root, source.branch, source.revision, mainBranch)
      if (!pr || !(await deps.contains(root, pr.mergeCommit, mainBranch))) {
        return false
      }
      const [current, currentTarget, currentOrigin] = await Promise.all([
        deps.git.inspect(root),
        deps.revision(root, mainBranch),
        deps.origin(root),
      ])
      return (
        current.available &&
        !current.dirty &&
        current.branch === source.branch &&
        current.revision === source.revision &&
        currentTarget === target &&
        currentOrigin === origin
      )
    },
    async branches(root, rows, mainBranch) {
      if (!mainBranch) {
        return rows
      }
      return Promise.all(rows.map((row) => branch(root, row, mainBranch)))
    },
  }
}
