import type { ReviewContext } from "./types/chat-context.js"
import type { Submission } from "./types/contracts.js"
import type { CaptureRun } from "./types/playwright.js"
import type { RunQueries } from "./types/services.js"
import type { UnitRun } from "./types/unit-tests.js"

export function reviewPath(
  kind: ReviewContext["kind"],
  id: string,
  target: { projectId?: string | null; worktreeId?: string | null } = {},
) {
  const query = new URLSearchParams()
  if (target.projectId) {
    query.set("project", target.projectId)
  }
  query.set("page", "review")
  query.set("kind", kind)
  query.set("id", id)
  if (target.worktreeId) {
    query.set("worktree", target.worktreeId)
  }
  return `/?${query.toString()}`
}
export function unknownFreshness(): ReviewContext["freshness"] {
  return {
    state: "unknown",
    reason:
      "Recorded execution inputs have not been compared with the current application and checkout. A pass does not establish current-code freshness.",
  }
}
export function boundedText(value: string) {
  return value.length > 2048 ? `${value.slice(0, 2047)}…` : value
}
export function reviewSummaryBase(
  kind: ReviewContext["kind"],
  run: { id: string; state: string; createdAt: string; finishedAt?: string | null },
  target: { projectId?: string; worktreeId?: string; projectRoot?: string },
): ReviewContext {
  return {
    kind,
    id: run.id,
    intent: `${kind} execution`,
    executionId: run.id,
    projectId: target.projectId ?? null,
    worktreeId: target.worktreeId ?? null,
    path: target.projectRoot ?? null,
    state: run.state,
    outcome: null,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt ?? null,
    reviewPath: reviewPath(kind, run.id, target),
    approval: null,
    cleanup: { state: "unknown", issues: [] },
    failures: [],
    failureCount: 0,
    evidence: [
      {
        type: "log",
        label: "Recorded diagnostics",
        tool: "get_run",
        arguments: { kind, id: run.id, detail: "log" },
      },
    ],
    evidenceCount: 1,
    freshness: unknownFreshness(),
    humanAcceptance: "not_recorded",
  }
}
export function boundReview(context: ReviewContext): ReviewContext {
  return {
    ...context,
    failures: context.failures.slice(0, 20).map((item) => ({
      ...item,
      message: boundedText(item.message),
      ...(item.case ? { case: boundedText(item.case) } : {}),
    })),
    failureCount: context.failures.length,
    evidence: context.evidence
      .slice(0, 20)
      .map((item) => ({ ...item, label: boundedText(item.label) })),
    evidenceCount: context.evidence.length,
    cleanup: {
      state: context.cleanup.state,
      issues: context.cleanup.issues.slice(0, 20).map(boundedText),
    },
  }
}
export function unitReviewContext(run: UnitRun): ReviewContext {
  const context = reviewSummaryBase("unit", run, run)
  context.intent = boundedText(run.settings.command)
  context.outcome = run.outcome
  context.cleanup = {
    state: run.cleanup.state,
    issues: run.cleanup.error ? [run.cleanup.error] : [],
  }
  if (run.error) {
    context.failures.push({
      scope: "execution",
      classification: run.outcome ?? "execution_error",
      message: run.error,
    })
  }
  if (run.outcome === "command_failed") {
    context.failures.push({
      scope: "command",
      classification: "command_failed",
      message: `The configured Unit command exited with code ${run.exitCode ?? "unknown"}. Read recorded diagnostics to distinguish assertion failure from setup or execution failure.`,
    })
  }
  return context
}
export function integrationReviewContext(
  run: ReturnType<RunQueries["get"]>,
  submission: Submission,
): ReviewContext {
  const context = reviewSummaryBase("integration", run, run.target ?? submission)
  context.outcome = run.result?.outcome ?? null
  context.cleanup = run.environment
    ? { state: run.environment.state, issues: run.environment.errors }
    : { state: run.environmentId ? "unknown" : "not_provisioned", issues: [] }
  for (const error of run.result?.errors ?? []) {
    context.failures.push({
      scope: "execution",
      classification: run.result?.outcome ?? "unknown",
      message: error,
    })
  }
  for (const item of run.result?.cases ?? []) {
    for (const error of item.errors) {
      context.failures.push({
        scope: "case",
        classification: run.result?.outcome ?? "unknown",
        message: error.message,
        file: item.file,
        case: item.name,
      })
    }
  }
  if (run.result && run.result.outcome !== "passed" && context.failures.length === 0) {
    context.failures.push({
      scope: "execution",
      classification: run.result.outcome,
      message: `Recorded outcome: ${run.result.outcome}. Inspect diagnostics and observed steps.`,
    })
  }
  for (const file of submission.files) {
    context.evidence.push({
      type: "source",
      label: file.path,
      tool: "get_run",
      arguments: { kind: "integration", id: run.id, detail: "source", sourcePath: file.path },
    })
  }
  return context
}
export function playwrightReviewContext(run: CaptureRun): ReviewContext {
  const context = reviewSummaryBase("playwright", run, run)
  context.intent = boundedText(run.target)
  context.outcome = run.outcome ?? null
  context.cleanup = { state: "unknown", issues: run.cleanupError ? [run.cleanupError] : [] }
  if (run.cleanupError) {
    context.cleanup.state = "failed"
  }
  if (run.error) {
    context.failures.push({
      scope: "execution",
      classification: run.outcome ?? "error",
      message: run.error,
    })
  }
  const sources = new Set<string>()
  for (const side of ["before", "after"] as const) {
    if (run[side].error) {
      context.failures.push({
        scope: side,
        classification: run[side].outcome ?? "error",
        message: run[side].error,
      })
    }
    for (const item of run[side].cases) {
      for (const error of item.errors) {
        context.failures.push({
          scope: side,
          classification: item.status,
          message: error,
          file: item.file,
          case: item.title,
        })
      }
      if (!sources.has(item.file)) {
        sources.add(item.file)
        context.evidence.push({
          type: "source",
          label: item.file,
          tool: "get_run",
          arguments: { kind: "playwright", id: run.id, detail: "source", sourcePath: item.file },
        })
      }
      for (const artifact of item.artifacts) {
        const image = artifact.contentType === "image/png" && artifact.bytes <= 8 * 1024 * 1024
        context.evidence.push({
          type: image ? "image" : "attachment",
          label: artifact.name,
          contentType: artifact.contentType,
          bytes: artifact.bytes,
          ...(image
            ? {
                tool: "get_run",
                arguments: {
                  kind: "playwright",
                  id: run.id,
                  detail: "image",
                  artifactId: artifact.id,
                  side,
                },
              }
            : {}),
        })
      }
    }
  }
  if (run.outcome && run.outcome !== "passed" && context.failures.length === 0) {
    context.failures.push({
      scope: "execution",
      classification: run.outcome,
      message: `Recorded outcome: ${run.outcome}. Inspect diagnostics and observed steps.`,
    })
  }
  return context
}
