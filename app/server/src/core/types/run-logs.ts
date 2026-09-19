import type { Run } from "./contracts.js"
import type { CaptureRun } from "./playwright.js"
import type { UnitRun } from "./unit-tests.js"

export type RunLogs = {
  stdout: { text: string; truncated: boolean } | null
  stderr: { text: string; truncated: boolean } | null
}
export type RunLogReader = (id: string) => Promise<RunLogs>
export type ExecutionSummary = Pick<Run, "id" | "state" | "createdAt" | "finishedAt"> & {
  kind: "integration" | "unit" | "playwright"
  submissionId?: string
  intent: string
  outcome: string | null
}

export type ExecutionSources = { units(): UnitRun[]; captures(): CaptureRun[] }
