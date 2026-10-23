import type { BranchReview } from "./git.js"

export type MergedPullRequest = { number: number; url: string; mergeCommit: string }
export type GitHubMergeTracking = {
  merged(
    root: string,
    branch: string,
    head: string,
    base: string,
    origin?: string,
  ): Promise<MergedPullRequest | null>
}
export type MergeTracking = {
  isMerged(root: string, mainBranch: string): Promise<boolean>
  branches(root: string, rows: BranchReview[], mainBranch: string | null): Promise<BranchReview[]>
}
