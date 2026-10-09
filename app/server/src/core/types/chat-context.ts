export type ExecutionKind = "unit" | "integration" | "playwright"
export type ObservedBinding = {
  projectId: string
  worktreeId: string
  checkoutRoot: string
  disconnected: boolean
}
export type EvidenceFreshness = { state: "unknown"; reason: string }
export type ChatExecutionSummary = {
  id: string
  kind: ExecutionKind
  intent: string
  state: string
  outcome: string | null
  createdAt: string
  finishedAt: string | null
  reviewPath: string
}
export type WorkspaceStatus = {
  path: string
  projectRoot: string
  rulesRoot: string
  observedBinding: ObservedBinding | null
  settings: {
    valid: boolean
    file: string
    digest?: string
    issues: {
      code: string
      path: string
      message: string
      file?: string
      line?: number
      column?: number
    }[]
    issueCount: number
  }
  readiness: "not_checked"
  approval: {
    policy: "ask" | "auto"
    pending: Pick<ChatExecutionSummary, "id" | "kind" | "state" | "createdAt" | "reviewPath">[]
    pendingCount: number
  }
  executions: {
    recent: ChatExecutionSummary[]
    active: ChatExecutionSummary[]
    cleanup: ChatExecutionSummary[]
    nextCursor: string | null
    activeCount: number
    cleanupCount: number
  }
  freshness: EvidenceFreshness
  humanAcceptance: "not_recorded"
  nextActions: { action: string; tool: string; arguments: Record<string, unknown> }[]
}
export type ApprovalPreview = {
  settingsDigest: string
  inputDigest?: string
  sourceDigest?: string
  command?: string
  cwd?: string
  dockerfile?: string
  target?: string
  purpose?: string
  viewport?: { width: number; height: number }
  services?: string[]
  serviceCount?: number
  dependencies?: { name: string; kind: string }[]
  dependencyCount?: number
  tests?: { path: string; scenarios: string[]; scenarioCount: number }[]
  testFileCount?: number
}
export type ReviewContext = {
  kind: ExecutionKind
  id: string
  intent: string
  executionId: string | null
  projectId: string | null
  worktreeId: string | null
  path: string | null
  state: string
  outcome: string | null
  createdAt: string
  finishedAt: string | null
  reviewPath: string
  approval: {
    state: string
    policy: "auto" | "ask"
    requestId: string
    revision: number
    environmentApproved?: boolean
    testsApproved?: boolean
    preview?: ApprovalPreview
  } | null
  cleanup: { state: string; issues: string[] }
  failures: {
    scope: string
    classification: string
    message: string
    file?: string
    case?: string
  }[]
  failureCount: number
  evidence: {
    type: "log" | "source" | "image" | "attachment"
    label: string
    tool?: string
    arguments?: Record<string, unknown>
    contentType?: string
    bytes?: number
  }[]
  evidenceCount: number
  freshness: EvidenceFreshness
  humanAcceptance: "not_recorded"
}
