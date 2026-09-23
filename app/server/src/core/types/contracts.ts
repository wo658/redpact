import type { Environment } from "./environment.js"
import type { GitSnapshot } from "./git.js"
import type { WorktreeSelection } from "./settings.js"
import type { WorkStart } from "./start-work.js"
import type { TestConnections } from "./test-connections.js"
import type { ResourceLimit } from "./test-resources.js"
export type SourceFile = { path: string; source: string }
export type Assertion = { code: string; reason: string | null; line: number; observed: "unknown" }
export type Scenario = {
  title: string
  intent: string | null
  line: number
  assertions: Assertion[]
}
export type ParsedFile = { scenarios: Scenario[]; limitations: string[] }
export type ProjectTracking = {
  mainBranch: string | null
  hideMerged: boolean
  showBranches?: boolean
}
export type ProjectRecord = {
  disconnectedAt?: string
  tracking?: ProjectTracking
  id: string
  name: string
  location:
    | { kind: "git"; commonGitdir: string; projectPath: string }
    | { kind: "directory"; root: string }
  createdAt: string
}
export type Worktree = {
  branch?: string | null
  id: string
  projectId: string
  checkoutRoot: string
  projectRoot: string
  gitdir: string | null
  createdAt: string
}
export type Target = {
  projectId: string
  worktreeId: string
  projectRoot: string
  checkoutRoot: string
}
export type WorkItem = {
  id: string
  intent: string
  createdAt: string
  projectId?: string
  worktreeId?: string
}
export type Submission = {
  projectId?: string
  worktreeId?: string
  projectRoot?: string
  id: string
  workItemId: string
  files: SourceFile[]
  digest: string
  runnerVersion: string
  parsed: { path: string; review: ParsedFile }[]
  createdAt: string
}
export type Outcome =
  | "passed"
  | "assertion_failed"
  | "collection_error"
  | "environment_error"
  | "execution_error"
  | "configuration_error"
  | "cancelled"
  | "interrupted"
  | "unknown"
export type StepResult = {
  id: string
  name: string
  state: "passed" | "failed" | "interrupted"
  startedAt: number
  durationMs?: number
}
export type CaseResult = {
  steps?: StepResult[]
  name: string
  file: string
  state: string
  errors: { name: string; message: string; stack?: string }[]
}
export type RunResult = {
  outcome: Outcome
  cases: CaseResult[]
  errors: string[]
  resourceLimit?: ResourceLimit
}
export type Run = {
  environmentPolicy?: { source: "new"; retain: "never" }
  environmentId?: string
  target?: Target
  git?: GitSnapshot
  settings?: { file: string; source: string; digest: string }
  id: string
  submissionId: string
  state: "queued" | "running" | "finished"
  result: RunResult | null
  createdAt: string
  finishedAt: string | null
  limitations: string[]
}
export type Store = {
  getWorktreeSelection(id: string): WorktreeSelection | undefined
  saveWorktreeSelection(record: WorktreeSelection): void
  saveEnvironment(value: Environment): void
  getEnvironment(id: string): Environment | undefined
  listEnvironments(): Environment[]
  saveWorkStart(value: WorkStart): void
  getWorkStart(id: string): WorkStart | undefined
  listWorkStarts(): WorkStart[]
  createProject(value: ProjectRecord): void
  promoteProject(value: ProjectRecord): void
  updateProject(value: ProjectRecord): void
  getProject(id: string): ProjectRecord | undefined
  listProjects(): ProjectRecord[]
  saveWorktree(value: Worktree): void
  getWorktree(id: string): Worktree | undefined
  listWorktrees(): Worktree[]
  listWorkItems(): WorkItem[]
  createWorkItem(value: WorkItem): void
  getWorkItem(id: string): WorkItem | undefined
  createSubmission(value: Submission): void
  getSubmission(id: string): Submission | undefined
  saveRun(value: Run): void
  getRun(id: string): Run | undefined
  listSubmissions(): Submission[]
  submissionPage(
    worktreeId: string,
    before: string | undefined,
    limit: number,
  ): Submission[] | undefined
  listRuns(): Run[]
  unfinishedRuns(): Run[]
}
export type TestRunner = {
  version: string
  execute(
    submission: Submission,
    runId: string,
    signal: AbortSignal,
    settings?: { tests: { timeoutMs: number } },
    environment?: Record<string, string>,
    secretValues?: string[],
    connections?: TestConnections,
  ): Promise<RunResult>
}
export type Scheduler = {
  add<T>(key: string, task: () => Promise<T>): Promise<T>
  idle(): Promise<void>
}
