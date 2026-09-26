import type { ProjectEntry } from "../../../server/src/core/types/project-files"
export type ResourceLimit = {
  kind: "memory" | "time"
  source: "process_rss" | "docker_oom" | "wall_clock"
  limits: { memoryMiB: number; timeoutSeconds: number }
  detectedAt: string
  elapsedMs: number
  observedMiB: number | null
  termination: {
    target: "process_group" | "container"
    confirmed: boolean
    exitCode: number | null
    signal: string | null
  }
}

import type {
  PublishPullRequest,
  PullRequest,
  PullRequestInspection,
} from "../../../server/src/core/types/pull-requests"
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
export type PlaywrightFile = {
  path: string
  target: string
  purpose: "capture" | "functional"
  scope?: "worktree" | "project"
}
export type CaptureRun = {
  target: string
  purpose: "capture" | "functional"
  scope?: "worktree" | "project"
  version: 1
  id: string
  worktreeId: string
  projectId: string
  projectRoot: string
  revision: string | null
  baseRevision?: string
  baseError?: string
  settings: {
    targets: Record<
      string,
      { purpose: "capture" | "functional"; scope?: "worktree" | "project"; testMatch: string[] }
    >
    directory: string
    service: string
    port: number
    viewport: { width: number; height: number }
    mobileViewport: { width: number; height: number }
    locale: string
    timezoneId: string
    colorScheme: string
    video: boolean
  }
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

import type { GitGraphPage } from "@web-git-graph/protocol"
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
export type MergeInspection = {
  source: Uncommitted
  target: Uncommitted | null
  targetBranch: string | null
  blockedReason: string | null
  records: MergeRecord[]
}

export type UnitRun = {
  resourceLimit?: ResourceLimit
  projectRoot: string
  id: string
  inputDigest?: string | null
  runtimeId?: string | null
  containerId?: string | null
  state: "running" | "finished"
  outcome: string | null
  settings: { dockerfile: string; cwd: string; command: string; patterns: string[] }
  cleanup: { state: "pending" | "removed" | "failed"; error: string | null }
  createdAt: string
  finishedAt: string | null
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  error: string | null
}
export type UnitInspection = {
  settings: UnitRun["settings"] | null
  catalog: {
    baseRevision?: string
    files: { path: string; source: string | null; issue?: string }[]
    diagnostics: string[]
  }
  runs: UnitRun[]
}
export type SettingsDocument = {
  file: string
  source: string | null
  revision: string | null
  value?: Record<string, unknown>
  issues: string[]
}
export type SettingsEdit = { source: string; revision: string | null }
export type PreviewEnvironment = {
  id: string
  state: string
  target: { worktreeId: string }
  endpoints: Record<string, { host: string; port: number }>
  services: { name: string; job: boolean }[]
}
export type SettingsIssue = {
  code: string
  path: string
  message: string
  file?: string
  line?: number
  column?: number
  related?: SettingsIssue[]
}
export type DependencyModeName = "isolated" | "shared-local" | "remote" | "mock"
export type SourceEvidence = { path: string; line?: number }
export type ApplicationService = { services: string[]; description?: string }
export type ServiceRelationship = {
  from: string
  to: { kind: "application" | "dependency"; name: string }
  description: string
  evidence: SourceEvidence[]
}
export type DependencyDefinition = DependencyMode & {
  description?: string
  kind: DependencyModeName
}
export type DependencyMode = {
  services?: string[]
  env?: Record<string, Record<string, string | { secret: string } | { unset: true }>>
}
export type DependencySettings = {
  valid: boolean
  file: string
  issues: SettingsIssue[]
  digest?: string
  bundle?: { files: { path: string; sha256: string }[] }
  services?: string[]
  dependencies?: Record<string, DependencyDefinition>
  applicationServices?: Record<string, ApplicationService>
  relationships?: ServiceRelationship[]
  worktreeId?: string
  projectId: string
}

export type TestSelection = { services: string[]; select: Record<string, string> }

export type WorktreeEnvironment = PreviewEnvironment & {
  target?: { projectRoot: string; checkoutRoot: string }
  lifecycle: "run" | "manual"
  resources?: {
    kind: "container" | "network" | "volume"
    id: string
    image?: string
    service?: string
    status?: string
  }[]
  errors?: string[]
  createdAt: string
  selection?: { services: string[]; select: Record<string, string> }
}

export type TestContainerInspection = {
  composeFiles: string[]
  target: Worktree | null
  environment:
    | (WorktreeEnvironment & {
        target: { projectRoot: string }
        errors: string[]
        specification: {
          tests: {
            env: Record<
              string,
              | string
              | { secret: string }
              | { service: string; port: number; scheme: "http" | "https" }
            >
          }
          playwright?: { service: string; port: number }
        }
      })
    | null
  changed: boolean | null
  issue: string | null
}

export type GitImageSide = { dataUrl: string } | { error: string } | null
export type GitImage = { baseRevision?: string; before: GitImageSide; after: GitImageSide }

export type GitDiff = {
  baseRevision?: string
  available: boolean
  revision?: string | null
  reason?: string
  patch: string
  omitted: string[]
}
export type Page<T> = { items: T[]; nextCursor: string | null }
export type SubmissionSummary = {
  id: string
  workItemId: string
  intent: string
  digest: string
  createdAt: string
}
export type TestSubmission = {
  id: string
  digest: string
  files: { path: string; source: string }[]
  parsed: {
    path: string
    review: {
      scenarios: {
        title: string
        intent: string | null
        assertions: { code: string; reason: string | null; observed: string }[]
      }[]
      limitations: string[]
    }
  }[]
}
export type RunSummary = { id: string; state: string; createdAt: string; finishedAt: string | null }
export type ExecutionSummary = RunSummary & {
  kind: "integration" | "unit" | "playwright"
  submissionId?: string
  intent: string
  outcome: string | null
}
export type RunLogs = {
  stdout: { text: string; truncated: boolean } | null
  stderr: { text: string; truncated: boolean } | null
}
export type TestRun = RunSummary & {
  environmentId?: string
  limitations: string[]
  result: null | {
    resourceLimit?: ResourceLimit
    outcome: string
    cases: {
      steps?: {
        id: string
        name: string
        state: "passed" | "failed" | "interrupted"
        startedAt: number
        durationMs?: number
      }[]
      name: string
      file: string
      state: string
      errors: { name: string; message: string; stack?: string }[]
    }[]
    errors: string[]
  }
}
export type ProjectTracking = {
  mainBranch: string | null
  hideMerged: boolean
  showBranches?: boolean
}
export type Project = {
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
export type WorkStartInput = {
  requestId: string
  projectId: string
  intent: string
  baseRef: string
  branch: string
  path: string
}
export type WorkStartResult = { worktreeId: string; workItemId: string; requestId: string }
export type WorkStartRecord = {
  id: string
  state: "prepared" | "attempted" | "created" | "completed"
  checkoutRoot: string
}

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown
  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function createApi(fetcher: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    method?: "PUT" | "PATCH" | "DELETE",
  ): Promise<T> {
    const response = await fetcher(`/api${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      cache: "no-store",
      redirect: "error",
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      payload = undefined
    }
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Request failed (${response.status})`
      throw new ApiError(response.status, message, payload)
    }
    if (payload === undefined) {
      throw new Error("The API returned an invalid response. Check the server connection.")
    }
    return payload as T
  }
  return {
    testContainer: (projectId: string, signal?: AbortSignal) =>
      request<TestContainerInspection>(
        `/projects/${encodeURIComponent(projectId)}/test-container`,
        undefined,
        signal,
      ),
    testContainerCompose: (projectId: string, path: string, signal?: AbortSignal) =>
      request<ProjectEntry>(
        `/projects/${encodeURIComponent(projectId)}/test-container/compose?${new URLSearchParams({ path })}`,
        undefined,
        signal,
      ),
    testContainerAction: (projectId: string, action: "start" | "restart" | "stop") =>
      request<TestContainerInspection>(
        `/projects/${encodeURIComponent(projectId)}/test-container/${action}`,
        {},
      ),
    projectFile: (projectId: string, path: string, signal?: AbortSignal) =>
      request<ProjectEntry>(
        `/projects/${encodeURIComponent(projectId)}/files?${new URLSearchParams({ path })}`,
        undefined,
        signal,
      ),
    commitDiff: (projectId: string, oid: string, signal?: AbortSignal) =>
      request<GitDiff>(
        `/projects/${encodeURIComponent(projectId)}/git/commits/${encodeURIComponent(oid)}/diff`,
        undefined,
        signal,
      ),
    gitFetch: (projectId: string) =>
      request<{ remotes: string[] }>(`/projects/${encodeURIComponent(projectId)}/git/fetch`, {}),
    gitGraph: (
      projectId: string,
      query: { refs?: readonly string[]; cursor?: string; limit?: number } = {},
      signal?: AbortSignal,
    ) => {
      const params = new URLSearchParams()
      for (const ref of query.refs ?? []) {
        params.append("ref", ref)
      }
      if (query.cursor) {
        params.set("cursor", query.cursor)
      }
      if (query.limit) {
        params.set("limit", String(query.limit))
      }
      return request<GitGraphPage>(
        `/projects/${encodeURIComponent(projectId)}/git/graph?${params}`,
        undefined,
        signal,
      )
    },
    pickDirectory: (signal?: AbortSignal) =>
      request<{ path: string | null }>("/dialogs/directory", {}, signal),
    unitTests: (id: string, signal?: AbortSignal, scope: "changed" | "all" = "changed") =>
      request<UnitInspection>(
        `/worktrees/${encodeURIComponent(id)}/unit-tests?scope=${scope}`,
        undefined,
        signal,
      ),
    runUnitTests: (id: string) =>
      request<UnitRun>(`/worktrees/${encodeURIComponent(id)}/unit-tests/run`, {}),
    cancelUnitRun: (id: string) =>
      request<UnitRun>(`/unit-runs/${encodeURIComponent(id)}/cancel`, {}),
    projectSecretValue: (id: string, name: string, signal?: AbortSignal) =>
      request<{ value: string }>(
        `/projects/${encodeURIComponent(id)}/secrets/${encodeURIComponent(name)}`,
        undefined,
        signal,
      ),
    projectSecrets: (id: string, signal?: AbortSignal) =>
      request<{ name: string; configured: boolean }[]>(
        `/projects/${encodeURIComponent(id)}/secrets`,
        undefined,
        signal,
      ),
    saveProjectSecret: (id: string, name: string, value: string) =>
      request<{ name: string; configured: boolean }>(
        `/projects/${encodeURIComponent(id)}/secrets/${encodeURIComponent(name)}`,
        { value },
        undefined,
        "PUT",
      ),
    projectConfiguration: (id: string, signal?: AbortSignal) =>
      request<SettingsDocument>(
        `/projects/${encodeURIComponent(id)}/configuration`,
        undefined,
        signal,
      ),
    saveProjectConfiguration: (id: string, input: SettingsEdit) =>
      request<SettingsDocument>(
        `/projects/${encodeURIComponent(id)}/configuration`,
        input,
        undefined,
        "PUT",
      ),
    instanceSettings: (signal?: AbortSignal) =>
      request<SettingsDocument>("/instance/settings", undefined, signal),
    saveInstanceSettings: (input: SettingsEdit) =>
      request<SettingsDocument>("/instance/settings", input, undefined, "PUT"),
    approvalPolicy: (signal?: AbortSignal) =>
      request<{ policy: "auto" | "ask" }>("/approval-policy", undefined, signal),
    setApprovalPolicy: (policy: "auto" | "ask") =>
      request<{ policy: "auto" | "ask" }>("/approval-policy", { policy }),
    projectDependencies: async (projectId: string, signal?: AbortSignal) => {
      try {
        return await request<DependencySettings>(
          `/projects/${encodeURIComponent(projectId)}/dependencies`,
          undefined,
          signal,
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          const result = error.details as Partial<DependencySettings> | null
          if (
            result?.valid === false &&
            typeof result.file === "string" &&
            Array.isArray(result.issues)
          ) {
            return result as DependencySettings
          }
        }
        throw error
      }
    },
    worktreeDependencies: (worktreeId: string, signal?: AbortSignal) =>
      request<DependencySettings>(
        `/worktrees/${encodeURIComponent(worktreeId)}/dependencies`,
        undefined,
        signal,
      ),
    planEnvironment: (worktreeId: string) =>
      request<DependencySettings>(
        `/worktrees/${encodeURIComponent(worktreeId)}/dependencies/plan`,
        {},
      ),
    stopEnvironment: (id: string) =>
      request<WorktreeEnvironment>(`/environments/${encodeURIComponent(id)}/stop`, {}),
    reviewContent: (worktreeId: string, signal?: AbortSignal) =>
      request<{
        preview: boolean
        unit: boolean
        tests: boolean
        log: boolean
        environment: boolean
      }>(`/worktrees/${encodeURIComponent(worktreeId)}/review-content`, undefined, signal),
    environments: (worktreeId: string, signal?: AbortSignal) =>
      request<WorktreeEnvironment[]>(
        `/environments?worktreeId=${encodeURIComponent(worktreeId)}`,
        undefined,
        signal,
      ),
    githubConnection: () => request<{ login: string; cliPath: string }>("/instance/github"),
    pullRequestInspection: (worktreeId: string, signal?: AbortSignal) =>
      request<PullRequestInspection>(
        `/worktrees/${encodeURIComponent(worktreeId)}/pull-request`,
        undefined,
        signal,
      ),
    publishPullRequest: (worktreeId: string, input: PublishPullRequest) =>
      request<PullRequest>(`/worktrees/${encodeURIComponent(worktreeId)}/pull-request`, input),
    mergeInspection: (worktreeId: string, signal?: AbortSignal) =>
      request<MergeInspection>(
        `/worktrees/${encodeURIComponent(worktreeId)}/merge`,
        undefined,
        signal,
      ),
    commitChanges: (worktreeId: string, revision: string, message: string) =>
      request<Uncommitted>(`/worktrees/${encodeURIComponent(worktreeId)}/git/commit`, {
        revision,
        message,
      }),
    discardChanges: (worktreeId: string, revision: string) =>
      request<Uncommitted>(`/worktrees/${encodeURIComponent(worktreeId)}/git/discard`, {
        revision,
      }),
    mergeWorktree: (
      worktreeId: string,
      input: { requestId: string; sourceRevision: string; targetRevision: string },
    ) => request<MergeRecord>(`/worktrees/${encodeURIComponent(worktreeId)}/merge`, input),
    committedImage: (
      projectId: string,
      query: { path: string; oldPath?: string; before?: string; after: string },
      signal?: AbortSignal,
    ) =>
      request<GitImage>(
        `/projects/${encodeURIComponent(projectId)}/git/image?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined))}`,
        undefined,
        signal,
      ),
    gitImage: (worktreeId: string, path: string, signal?: AbortSignal, scope = "all") =>
      request<GitImage>(
        `/worktrees/${encodeURIComponent(worktreeId)}/git/image?${new URLSearchParams({ path, scope })}`,
        undefined,
        signal,
      ),
    runIntegrationTests: (worktreeId: string) =>
      request<TestRun & { submissionId: string }>(
        `/worktrees/${encodeURIComponent(worktreeId)}/integration-tests/run`,
        {},
      ),
    integrationTests: (
      worktreeId: string,
      signal?: AbortSignal,
      scope: "changed" | "all" = "changed",
    ) =>
      request<{ directory: string; catalog: UnitInspection["catalog"] }>(
        `/worktrees/${encodeURIComponent(worktreeId)}/integration-tests?scope=${scope}`,
        undefined,
        signal,
      ),
    gitDiff: (worktreeId: string, scope: "all" | "staged" | "unstaged", signal?: AbortSignal) =>
      request<GitDiff>(
        `/worktrees/${encodeURIComponent(worktreeId)}/git/diff?scope=${scope}`,
        undefined,
        signal,
      ),
    submissions: (worktreeId: string, before = "", signal?: AbortSignal) =>
      request<Page<SubmissionSummary>>(
        `/submissions?${new URLSearchParams({ worktreeId, ...(before ? { before } : {}) })}`,
        undefined,
        signal,
      ),
    submission: (id: string, signal?: AbortSignal) =>
      request<TestSubmission>(`/submissions/${encodeURIComponent(id)}`, undefined, signal),
    startRun: (submissionId: string) => request<TestRun>("/runs", { submissionId }),
    runs: (submissionId: string, before = "", signal?: AbortSignal) =>
      request<Page<RunSummary>>(
        `/runs?${new URLSearchParams({ submissionId, ...(before ? { before } : {}) })}`,
        undefined,
        signal,
      ),
    copyExecutionLog: (kind: ExecutionSummary["kind"], id: string, signal?: AbortSignal) =>
      request<{ text: string }>(
        `/runs/executions/${kind}/${encodeURIComponent(id)}/copy`,
        undefined,
        signal,
      ),
    executionLogs: (worktreeId: string, before = "", signal?: AbortSignal) =>
      request<Page<ExecutionSummary>>(
        `/runs?worktreeId=${encodeURIComponent(worktreeId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
        undefined,
        signal,
      ),
    runLogs: (id: string, signal?: AbortSignal) =>
      request<RunLogs>(`/runs/${encodeURIComponent(id)}/logs`, undefined, signal),
    run: (id: string, signal?: AbortSignal) =>
      request<TestRun>(`/runs/${encodeURIComponent(id)}`, undefined, signal),
    projectPlaywrightCatalog: (id: string, signal?: AbortSignal) =>
      request<{ root: string; settings: CaptureRun["settings"] | null; files: PlaywrightFile[] }>(
        `/projects/${encodeURIComponent(id)}/playwright`,
        undefined,
        signal,
      ),
    projectPlaywrightSource: async (id: string, path: string, signal?: AbortSignal) => {
      const response = await fetcher(
        `/api/projects/${encodeURIComponent(id)}/playwright/source?path=${encodeURIComponent(path)}`,
        { signal, cache: "no-store", redirect: "error" },
      )
      if (!response.ok) {
        throw new Error(`Unable to read Playwright source (${response.status})`)
      }
      return response.text()
    },
    projectPlaywright: (id: string, signal?: AbortSignal) =>
      request<{ runs: CaptureRun[] }>(
        `/projects/${encodeURIComponent(id)}/playwright-runs`,
        undefined,
        signal,
      ),
    captureSource: async (id: string, path: string, signal?: AbortSignal) => {
      const response = await fetcher(
        `/api/playwright-runs/${encodeURIComponent(id)}/source?path=${encodeURIComponent(path)}`,
        { signal, cache: "no-store", redirect: "error" },
      )
      if (!response.ok) {
        throw new Error(`Unable to read recorded source (${response.status})`)
      }
      return response.text()
    },
    worktreePlaywrightCatalog: (id: string, signal?: AbortSignal) =>
      request<{ files: PlaywrightFile[]; baseRevision?: string; diagnostics: string[] }>(
        `/worktrees/${encodeURIComponent(id)}/playwright/catalog`,
        undefined,
        signal,
      ),
    playwright: (id: string, signal?: AbortSignal) =>
      request<{
        settings: CaptureRun["settings"] | null
        runs: CaptureRun[]
        inputDigest?: string
        error?: string
      }>(`/worktrees/${encodeURIComponent(id)}/playwright`, undefined, signal),
    runPlaywright: (id: string, viewport?: { width: number; height: number }, target?: string) =>
      request<CaptureRun>(`/worktrees/${encodeURIComponent(id)}/playwright/run`, {
        viewport,
        target,
      }),
    cleanupPlaywrightWorktree: (id: string) =>
      request<{ cleaned: boolean }>(
        `/worktrees/${encodeURIComponent(id)}/playwright/cleanup-worktree`,
        {},
      ),
    cancelPlaywright: (id: string) =>
      request<CaptureRun>(`/playwright-runs/${encodeURIComponent(id)}/cancel`, {}),
    captureArtifact: (id: string, side: "before" | "after", artifact: string) =>
      `/api/playwright-runs/${encodeURIComponent(id)}/${side}/artifacts/${encodeURIComponent(artifact)}`,
    getTracking: (projectId: string, signal?: AbortSignal) =>
      request<{
        projectRoot: string
        tracking: ProjectTracking
      }>(`/projects/${encodeURIComponent(projectId)}/tracking`, undefined, signal),
    getBranches: (projectId: string, signal?: AbortSignal) =>
      request<string[]>(`/projects/${encodeURIComponent(projectId)}/branches`, undefined, signal),
    branchReviews: (projectId: string, signal?: AbortSignal) =>
      request<BranchReview[]>(
        `/projects/${encodeURIComponent(projectId)}/branch-reviews`,
        undefined,
        signal,
      ),
    branchDiff: (projectId: string, branch: string, signal?: AbortSignal) =>
      request<GitDiff>(
        `/projects/${encodeURIComponent(projectId)}/branch-diff?branch=${encodeURIComponent(branch)}`,
        undefined,
        signal,
      ),
    setTracking: (projectId: string, tracking: ProjectTracking) =>
      request<Project>(`/projects/${encodeURIComponent(projectId)}/tracking`, tracking),
    projects: (signal?: AbortSignal) => request<Project[]>("/projects", undefined, signal),
    managedProjects: (signal?: AbortSignal) =>
      request<(Project & { projectRoot: string | null; available: boolean })[]>(
        "/projects?includeDisconnected=true",
        undefined,
        signal,
      ),
    renameProject: (id: string, name: string) =>
      request<Project>(`/projects/${encodeURIComponent(id)}`, { name }, undefined, "PATCH"),
    disconnectProject: (id: string) =>
      request<Project>(`/projects/${encodeURIComponent(id)}`, undefined, undefined, "DELETE"),
    reconnectProject: (id: string) =>
      request<Project>(`/projects/${encodeURIComponent(id)}/reconnect`, {}),
    connect: (path: string, name?: string) =>
      request<Project>("/projects", { path, ...(name ? { name } : {}) }),
    worktrees: (projectId: string, signal?: AbortSignal) =>
      request<Worktree[]>(
        `/projects/${encodeURIComponent(projectId)}/worktrees`,
        undefined,
        signal,
      ),
    start: (input: WorkStartInput) => request<WorkStartResult>("/work-starts", input),
    getStart: (id: string) => request<WorkStartRecord>(`/work-starts/${encodeURIComponent(id)}`),
  }
}
export type Api = ReturnType<typeof createApi>

export type BranchReview = {
  name: string
  revision: string
  merged: boolean
  worktrees: { path: string; missing: boolean }[]
}
