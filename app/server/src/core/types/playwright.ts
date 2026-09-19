import type { Environment } from "./environment.js"
import type { Settings, TestSelection } from "./settings.js"
import type { ResourceLimit } from "./test-resources.js"
export type PlaywrightSettings = NonNullable<Settings["playwright"]>
export type CaptureArtifact = {
  viewport?: { width: number; height: number }
  id: string
  name: string
  contentType: string
  bytes: number
  sha256: string
}
export type CaptureCase = {
  id: string
  title: string
  file: string
  status: string
  duration: number
  errors: string[]
  steps: { title: string; duration: number; error?: string }[]
  artifacts: CaptureArtifact[]
}
export type CaptureSide = {
  resourceLimit?: ResourceLimit
  state: "pending" | "running" | "finished" | "unavailable"
  root?: string
  environmentId?: string
  inputDigest?: string
  imageId?: string
  runtimeId?: string
  containerId?: string
  browserVersion?: string
  platform?: string
  outcome?: string
  error?: string
  cases: CaptureCase[]
}
export type CaptureRun = {
  version: 1
  target: string
  purpose: "capture" | "functional"
  scope?: "worktree" | "project"
  id: string
  worktreeId: string
  projectId: string
  projectRoot: string
  revision: string | null
  baseRevision?: string
  baseError?: string
  settings: PlaywrightSettings
  selection: TestSelection
  settingsDigest: string
  sourceDigest: string
  appDigest: string
  createdAt: string
  finishedAt?: string
  state: "queued" | "running" | "finished"
  outcome?: "passed" | "failed" | "error" | "cancelled" | "interrupted"
  error?: string
  cleanupError?: string
  before: CaptureSide
  after: CaptureSide
}
export type CaptureStore = {
  source(run: CaptureRun, path: string): Promise<string>
  list(): CaptureRun[]
  save(run: CaptureRun): void
  artifact(
    run: CaptureRun,
    side: "before" | "after",
    id: string,
  ): Promise<{ data: Uint8Array; contentType: string }>
}
export type CaptureRunner = {
  cleanupWorktree(run: CaptureRun): Promise<void>
  captureSources(id: string, root: string, settings: PlaywrightSettings): Promise<string>
  execute(
    run: CaptureRun,
    side: "before" | "after",
    environment: Environment,
    signal: AbortSignal,
    observe: (patch: Partial<CaptureSide>) => void,
  ): Promise<Pick<CaptureSide, "cases" | "outcome" | "browserVersion">>
  stop(run: CaptureRun, side: "before" | "after"): Promise<void>
  removeInputs(id: string): Promise<void>
}
export type CaptureBaselineCleanup = {
  remove(run: CaptureRun): Promise<void>
}
export type CaptureService = {
  source(id: string, path: string): Promise<string>
  all(): CaptureRun[]
  get(id: string): CaptureRun
  list(worktreeId: string): CaptureRun[]
  listProject(projectId: string): CaptureRun[]
  save(run: CaptureRun): void
  artifact(
    id: string,
    side: "before" | "after",
    artifactId: string,
  ): ReturnType<CaptureStore["artifact"]>
}
export type CaptureWorkflow = {
  cleanupWorktree(worktreeId: string): Promise<void>
  inspect(worktreeId: string): Promise<{
    settings: PlaywrightSettings | null
    runs: CaptureRun[]
    sourceDigest?: string
    inputDigest?: string
    error?: string
  }>
  start(
    worktreeId: string,
    selection?: TestSelection,
    viewport?: { width: number; height: number },
    target?: string,
  ): Promise<CaptureRun>
  cancel(id: string): Promise<CaptureRun>
  recover(): Promise<void>
  close(): Promise<void>
}

export type PlaywrightFile = {
  path: string
  target: string
  purpose: "capture" | "functional"
  scope?: "worktree" | "project"
}
export type PlaywrightReviewCatalog = {
  files: PlaywrightFile[]
  baseRevision?: string
  diagnostics: string[]
}
export type PlaywrightCatalog = {
  worktree(worktreeId: string): Promise<PlaywrightReviewCatalog>
  inspect(
    projectId: string,
  ): Promise<{ root: string; files: PlaywrightFile[]; settings: PlaywrightSettings | null }>
  source(projectId: string, path: string): Promise<string>
}
