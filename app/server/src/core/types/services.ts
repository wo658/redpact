import type {
  ProjectRecord,
  ProjectTracking,
  Run,
  RunResult,
  SourceFile,
  Submission,
  TestRunner,
  WorkItem,
  Worktree,
} from "./contracts.js"
import type { Environment } from "./environment.js"
import type { BranchReview, GitDiff, GitService } from "./git.js"
import type { ExecutionSummary, RunLogs } from "./run-logs.js"
import type { SettingsService, TestSelection } from "./settings.js"
import type { StartWorkInput, WorkStart } from "./start-work.js"
import type { TestConnections } from "./test-connections.js"

// Identity publication shares the admission gate with execution and managed creation.
export type WorktreeAdmission = {
  ensure(projectId: string, path: string, managed?: { id: string }): Promise<Worktree>
}
export type WorktreeService = {
  exclusive<T>(operation: (admission: WorktreeAdmission) => Promise<T> | T): Promise<T>
  resolve(id: string): Promise<{ worktree: Worktree; settings: SettingsService; git: GitService }>
  getIntegrationDefaults(projectId: string): Promise<{ selection: TestSelection; saved: boolean }>
  setIntegrationDefaults(projectId: string, selection: TestSelection): Promise<TestSelection>
  getSelection(id: string): Promise<TestSelection | null>
  setSelection(id: string, selection: TestSelection): Promise<TestSelection>
  settingsForPath(path: string): Promise<SettingsService>
  projectSettings(id: string): Promise<SettingsService>
  getProject(id: string): ProjectRecord
  getWorktree(id: string): Worktree
  listProjects(): Promise<ProjectRecord[]>
  checkoutPaths(projectId: string): Promise<string[]>
  listWorktrees(projectId: string): Promise<Worktree[]>
  connect(path: string, name?: string): Promise<ProjectRecord>
  ensure(projectId: string, path: string): Promise<Worktree>
}
export type WorkStarts = {
  get(id: string): WorkStart
  start(input: StartWorkInput): Promise<{
    requestId: string
    workItemId: string
    worktreeId: string
    projectId: string
    checkoutRoot: string
    projectRoot: string
    revision: string
    configure: { tool: string; arguments: { action: string; worktreeId: string } }
    nextSteps: string[]
  }>
}
export type SubmissionsService = {
  latest(worktreeId: string): Submission | undefined
  submitObserved(intent: string, worktreeId: string, files: SourceFile[]): Promise<Submission>
  list(
    worktreeId: string,
    before?: string,
  ): {
    items: (Pick<Submission, "id" | "workItemId" | "digest" | "createdAt"> & { intent: string })[]
    nextCursor: string | null
  }
  createWork(intent: string, worktreeId?: string): Promise<WorkItem>

  submitForWork(workItemId: string, files: SourceFile[]): Promise<Submission>
  getWork(id: string): WorkItem
  listWork(projectId: string): WorkItem[]
  createWorkItem(intent: string, worktreeId?: string): WorkItem
  submit(workItemId: string, files: SourceFile[]): Submission
  get(id: string): Submission
}
export type RunService = {
  get(id: string): Run
  unfinished(): Run[]
  submission(id: string): Submission
  finish(id: string, result: RunResult): Run
  cancel(id: string): Run
  activeIds(): string[]
  wasCancelled(id: string): boolean
  bindEnvironment(id: string, environmentId: string): Run
  accept(run: Run): AbortController
  execute(
    id: string,
    settings?: Parameters<TestRunner["execute"]>[3],
    environment?: Record<string, string>,
    secrets?: string[],
    connections?: TestConnections,
  ): Promise<RunResult>
  cancelAndWait(id: string): Promise<void>
  release(id: string): void
}
export type RunQueries = {
  copyLog(kind: ExecutionSummary["kind"], id: string): Promise<{ text: string }>
  listForWorktree(
    worktreeId: string,
    before?: string,
  ): { items: ExecutionSummary[]; nextCursor: string | null }
  logs(id: string): Promise<RunLogs>
  list(
    submissionId: string,
    before?: string,
  ): { items: Pick<Run, "id" | "state" | "createdAt" | "finishedAt">[]; nextCursor: string | null }
  get(
    id: string,
  ): Run & { environment?: Pick<Environment, "id" | "state" | "endpoints" | "errors"> }
}
export type EnvironmentService = {
  fingerprint(
    worktreeId: string,
    selection: TestSelection,
    expectedSettingsDigest: string,
  ): Promise<string>
  get(id: string): Environment
  refresh(id: string): Promise<Environment>
  list(worktreeId: string): Environment[]
  temporary(): Environment[]
  prepare(
    worktreeId: string,
    requestId: string,
    expectedSettingsDigest: string,
    selection: TestSelection,
    runId: string | null,
  ): Promise<Environment>
  abortPreparations(): void
  reserve(
    id: string,
    worktreeId: string,
    runId: string,
    settingsDigest: string,
  ): Promise<Environment>
  secretValues(id: string): Promise<string[]>
  executionValues(id: string): Promise<Record<string, string>>
  healthy(id: string): Promise<boolean>
  finish(id: string, runId?: string): void
  beginStop(id: string): Promise<Environment>
  failStop(id: string): void
  completeStop(id: string): Promise<Environment>
  recover(): Promise<void>
  idle(): Promise<void>
  close(): Promise<void>
}
export type StopEnvironment = {
  (id: string): Promise<Environment>
  cleanupTemporary(): Promise<void>
  idle(): Promise<void>
}
export type ExecuteTests = {
  start(
    submissionId: string,
    selection?: TestSelection,
    expectedSettingsDigest?: string,
  ): Promise<Run>
  cancel(id: string): Run
  close(): Promise<void>
}

export type ProjectSettingsService = {
  root(id: string): Promise<string>
  tracking(id: string): Promise<ProjectTracking>
  read(id: string): Promise<{ projectRoot: string; tracking: ProjectTracking }>
  branches(id: string): Promise<string[]>
  branchReviews(id: string): Promise<BranchReview[]>
  branchDiff(id: string, branch: string): Promise<GitDiff>
  update(id: string, input: ProjectTracking): Promise<ProjectRecord>
}
