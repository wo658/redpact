export type GitSnapshot =
  | { available: false; reason: string }
  | {
      available: true
      root: string
      gitdir: string
      commonGitdir: string
      branch?: string | null
      revision: string | null
      dirty: boolean
      changes: { path: string; head: number; worktree: number; stage: number }[]
    }

export type GitMetadata =
  | { available: false; reason: string }
  | { available: true; root: string; gitdir: string; commonGitdir: string }

export type GitMetadataAdapter = {
  metadata(projectPath: string): Promise<GitMetadata>
  primaryRoot(commonGitdir: string): Promise<string>
  currentBranch(projectPath: string): Promise<string | null>
  listBranches(commonGitdir: string): Promise<string[]>
  listWorktrees(commonGitdir: string): Promise<string[]>
}

export type GitStatusAdapter = {
  isMerged(root: string, mainBranch: string): Promise<boolean>
  inspect(projectPath: string): Promise<GitSnapshot>
}

export type GitImageOptions = { scope?: GitScope; oldPath?: string }
export type GitImageQuery = { path: string; oldPath?: string; before?: string; after: string }

export type GitImageSide = { dataUrl: string } | { error: string } | null
export type GitImage = { baseRevision?: string; before: GitImageSide; after: GitImageSide }

export type GitContentAdapter = {
  image(
    projectPath: string,
    path: string,
    mainBranch?: string | null,
    options?: GitImageOptions,
  ): Promise<GitImage>
  mergeBase(projectPath: string, mainBranch: string | null): Promise<string>
  diff(projectPath: string, scope: GitScope, mainBranch?: string | null): Promise<GitDiff>
  readFile(projectPath: string, path: string, source: "head" | "index"): Promise<string | null>
}

export type GitAdapter = GitMetadataAdapter &
  GitStatusAdapter &
  GitContentAdapter &
  GitBranchAdapter

export type GitService = {
  image(path: string, mainBranch?: string | null, options?: GitImageOptions): Promise<GitImage>
  mergeBase(mainBranch?: string | null): Promise<string>
  diff(scope: GitScope, mainBranch?: string | null): Promise<GitDiff>
  inspect(): Promise<GitSnapshot>
  readFile(path: string, source?: "head" | "index"): Promise<string | null>
}

export type GitScope = "all" | "staged" | "unstaged"
export type GitDiff = {
  baseRevision?: string
  available: boolean
  revision?: string | null
  reason?: string
  patch: string
  omitted: string[]
}

export type BranchReview = {
  name: string
  revision: string
  merged: boolean
  worktrees: { path: string; missing: boolean }[]
}
export type GitBranchAdapter = {
  branchReviews(root: string, mainBranch: string | null): Promise<BranchReview[]>
  branchDiff(root: string, branch: string, mainBranch: string | null): Promise<GitDiff>
}
