import { problem } from "./problems.js"
import type { Run, RunResult } from "./types/contracts.js"

export function assertRunAdmission(run: Run, alreadyRecorded: boolean): void {
  if (run.state !== "queued" || run.result || run.finishedAt || alreadyRecorded) {
    problem("invalid_input", "A new run must begin queued without a result")
  }
}

export function assertEnvironmentBinding(run: Run, locallyAccepted: boolean): void {
  // A cancelled queued run still records resources allocated during admission.
  if (run.state === "running" || run.environmentId || !locallyAccepted) {
    problem("invalid_input", "Only a queued local run can acquire an environment")
  }
}

export function finishRun(run: Run, result: RunResult, finishedAt: string): Run {
  if (run.state === "finished") {
    return run
  }
  return { ...run, state: "finished", result, finishedAt }
}

export function decideRunResult(
  result: RunResult,
  facts: { userCancelled: boolean; environmentLost: boolean; aborted: boolean },
): RunResult {
  if (result.resourceLimit) {
    return result
  }
  if (facts.userCancelled) {
    return { outcome: "cancelled", cases: [], errors: [] }
  }
  if (facts.environmentLost) {
    return {
      ...result,
      outcome: "environment_error",
      errors: [...result.errors, "Required environment service was lost"],
    }
  }
  if (facts.aborted) {
    return { outcome: "cancelled", cases: [], errors: [] }
  }
  return result
}

export function executionFailureOutcome(aborted: boolean, code: unknown): RunResult["outcome"] {
  if (aborted) {
    return "cancelled"
  }
  if (
    typeof code === "string" &&
    ["configuration_error", "settings_invalid", "worktree_unavailable"].includes(code)
  ) {
    return "configuration_error"
  }
  if (typeof code === "string" && ["environment_error", "environment_conflict"].includes(code)) {
    return "environment_error"
  }
  return "execution_error"
}
