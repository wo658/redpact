import type { ReviewContext } from "../../../server/src/core/types/chat-context"
import { viewerFetch } from "./viewer-transport"
import { viewerUrl } from "./viewer-url"

export type { ReviewContext } from "../../../server/src/core/types/chat-context"

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

export type TestSelection = { services: string[]; select: Record<string, string> }

export type GitImageSide = { dataUrl: string } | { error: string } | null

export type Page<T> = { items: T[]; nextCursor: string | null }

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
  submissionId?: string
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

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown
  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function createApi(fetcher: typeof fetch = viewerFetch) {
  async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetcher(viewerUrl(`/api${path}`), {
      method: body === undefined ? "GET" : "POST",
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
    submission: (id: string, signal?: AbortSignal) =>
      request<TestSubmission>(`/submissions/${encodeURIComponent(id)}`, undefined, signal),
    reviewContext: (kind: ExecutionSummary["kind"], id: string, signal?: AbortSignal) =>
      request<ReviewContext>(
        `/review-context?${new URLSearchParams({ kind, id })}`,
        undefined,
        signal,
      ),
    approveExecutionReview: (
      kind: ExecutionSummary["kind"],
      id: string,
      revision: number,
      subject?: "environment" | "tests",
    ) =>
      request<unknown>(`/execution-reviews/${kind}/${encodeURIComponent(id)}/approve`, {
        revision,
        ...(subject ? { subject } : {}),
      }),
    cancelExecutionReview: (kind: ExecutionSummary["kind"], id: string) =>
      request<unknown>(`/execution-reviews/${kind}/${encodeURIComponent(id)}/cancel`, {}),
    unitRun: (id: string, signal?: AbortSignal) =>
      request<UnitRun>(`/unit-runs/${encodeURIComponent(id)}`, undefined, signal),
    captureRun: (id: string, signal?: AbortSignal) =>
      request<CaptureRun>(`/playwright-runs/${encodeURIComponent(id)}`, undefined, signal),
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
    captureSource: async (id: string, path: string, signal?: AbortSignal) => {
      const response = await fetcher(
        viewerUrl(
          `/api/playwright-runs/${encodeURIComponent(id)}/source?path=${encodeURIComponent(path)}`,
        ),
        { signal, cache: "no-store", redirect: "error" },
      )
      if (!response.ok) {
        throw new Error(`Unable to read recorded source (${response.status})`)
      }
      return response.text()
    },
    captureArtifact: (id: string, side: "before" | "after", artifact: string) =>
      viewerUrl(
        `/api/playwright-runs/${encodeURIComponent(id)}/${side}/artifacts/${encodeURIComponent(artifact)}`,
      ),
  }
}

export type Api = ReturnType<typeof createApi>
