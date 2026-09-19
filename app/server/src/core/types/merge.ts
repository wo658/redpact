import type { GitDiff } from "./git.js"

export type UncommittedFile = {
  path: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}
export type Uncommitted = {
  root: string
  commonGitdir: string
  branch: string | null
  head: string | null
  revision: string
  dirty: boolean
  blockedReason: string | null
  files: UncommittedFile[]
  staged: GitDiff
  unstaged: GitDiff
}
export type GitMutations = {
  currentBranch(root: string): Promise<string | null>
  inspect(root: string): Promise<Uncommitted>
  commit(root: string, revision: string, message: string): Promise<Uncommitted>
  discard(root: string, revision: string): Promise<Uncommitted>
  candidate(
    root: string,
    path: string,
    targetHead: string,
    sourceHead: string,
  ): Promise<{ head: string | null; conflicts: string[]; output: string }>
  publish(root: string, expected: Uncommitted, head: string): Promise<void>
  remove(root: string, path: string): Promise<void>
}
export type MergeRecord = {
  version: 1
  id: string
  worktreeId: string
  projectId: string
  sourceRoot: string
  sourceBranch: string
  sourceHead: string
  targetRoot: string
  targetBranch: string
  targetHead: string
  candidatePath: string
  mergedHead: string | null
  state: "running" | "merged" | "conflict" | "failed" | "interrupted"
  createdAt: string
  finishedAt: string | null
  conflicts: string[]
  output: string
  error: string | null
  cleanupError: string | null
  resolutionRequest: string
}
export type MergeStore = { list(): MergeRecord[]; save(record: MergeRecord): void }
export type MergeInspection = {
  source: Uncommitted
  target: Uncommitted | null
  targetBranch: string | null
  blockedReason: string | null
  records: MergeRecord[]
}
export type MergeService = {
  inspect(id: string): Promise<MergeInspection>
  commit(id: string, revision: string, message: string): Promise<Uncommitted>
  discard(id: string, revision: string): Promise<Uncommitted>
  merge(
    id: string,
    request: { requestId: string; sourceRevision: string; targetRevision: string },
  ): Promise<MergeRecord>
  close(): Promise<void>
  busy(): boolean
}
