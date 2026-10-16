import { resolve } from "node:path"
import type { z } from "zod"
import {
  boundedText,
  boundReview,
  integrationReviewContext,
  playwrightReviewContext,
  reviewPath,
  reviewSummaryBase,
  unitReviewContext,
  unknownFreshness,
} from "../core/chat-context.js"
import { summarizeExecutionSelection } from "../core/execution-selection.js"
import { problem } from "../core/problems.js"
import type { ReviewContext, WorkspaceStatus } from "../core/types/chat-context.js"
import type { CaptureRun } from "../core/types/playwright.js"
import type { UnitRun } from "../core/types/unit-tests.js"
import type { reviewContextInput } from "../core/verification-schema.js"
import type { Services } from "./services.js"
import { cancelExecution } from "./verification.js"

type Identity = z.infer<typeof reviewContextInput>
function pendingRequests(services: Services, path: string, worktreeId?: string) {
  const integration = (services.reviews?.list() ?? [])
    .filter(
      (item) =>
        (worktreeId && item.submission.worktreeId === worktreeId) ||
        resolve(item.review.path) === resolve(path),
    )
    .map(({ review, submission }) => ({
      id: review.id,
      kind: "integration" as const,
      state: review.state,
      createdAt: review.createdAt,
      reviewPath: reviewPath("integration", review.id, submission),
    }))
  const executions = (services.executionReviews?.list() ?? [])
    .filter(
      (item) =>
        (worktreeId && item.review.worktreeId === worktreeId) ||
        resolve(item.review.path) === resolve(path),
    )
    .map(({ review }) => ({
      id: review.id,
      kind: review.kind,
      state: review.state,
      createdAt: review.createdAt,
      reviewPath: reviewPath(review.kind, review.id, review),
    }))
  return [...integration, ...executions]
    .filter((item) => item.state === "pending" || item.state === "starting")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function getWorkspaceStatus(
  services: Services,
  path: string,
): Promise<WorkspaceStatus> {
  const files =
    services.localFiles ??
    problem("settings_unsupported", "Local settings inspection is unavailable")
  const settingsService = await files.settings(path)
  const [validation, binding] = await Promise.all([
    settingsService.read(),
    services.worktrees?.observed(settingsService.projectRoot) ?? null,
  ])
  const page = binding
    ? services.runs.listForWorktree(binding.worktreeId)
    : { items: [], nextCursor: null }
  const attention = binding
    ? services.runs.attentionForWorktree(binding.worktreeId)
    : { active: [], cleanup: [], activeCount: 0, cleanupCount: 0 }
  const summary = (run: (typeof page.items)[number]) => ({
    id: run.id,
    kind: run.kind,
    intent: boundedText(run.intent),
    state: run.state,
    outcome: run.outcome,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    reviewPath: reviewPath(run.kind, run.id, binding ?? {}),
  })
  const pending = pendingRequests(services, settingsService.projectRoot, binding?.worktreeId)
  const status = {
    path,
    projectRoot: settingsService.projectRoot,
    rulesRoot: settingsService.rulesRoot ?? settingsService.projectRoot,
    observedBinding: binding,
    settings: {
      valid: validation.valid,
      file: validation.file,
      ...(validation.digest ? { digest: validation.digest } : {}),
      issues: validation.issues.slice(0, 20).map(({ code, path, message, file, line, column }) => ({
        code,
        path,
        message: boundedText(message),
        ...(file ? { file } : {}),
        ...(line ? { line } : {}),
        ...(column ? { column } : {}),
      })),
      issueCount: validation.issues.length,
    },
    readiness: "not_checked" as const,
    approval: {
      policy: services.reviews?.policy() ?? "auto",
      pending: pending.slice(0, 20),
      pendingCount: pending.length,
    },
    executions: {
      recent: page.items.slice(0, 20).map(summary),
      active: attention.active.slice(0, 20).map(summary),
      cleanup: attention.cleanup.slice(0, 20).map(summary),
      nextCursor: page.nextCursor,
      activeCount: attention.activeCount,
      cleanupCount: attention.cleanupCount,
    },
    freshness: unknownFreshness(),
    humanAcceptance: "not_recorded" as const,
  }
  return status
}
function integrationContext(services: Services, id: string): ReviewContext {
  const pending = services.reviews?.get(id)
  if (!pending) {
    const run = services.runs.get(id)
    const submission = services.submissions.get(run.submissionId)
    const context = integrationReviewContext(run, submission)
    context.intent = submission.workItemId
      ? boundedText(services.submissions.getWork(submission.workItemId).intent)
      : "Integration tests"
    return boundReview(context)
  }
  const { review, submission, run } = pending
  const context = run
    ? integrationReviewContext(run, submission)
    : reviewSummaryBase("integration", review, submission)
  context.intent = submission.workItemId
    ? boundedText(services.submissions.getWork(submission.workItemId).intent)
    : "Integration tests"
  context.id = id
  context.executionId = run?.id ?? null
  context.reviewPath = reviewPath("integration", id, submission)
  context.approval = {
    requestId: review.id,
    policy: review.policy,
    state: review.state,
    revision: review.revision,
    environmentApproved: review.environmentApproved,
    testsApproved: review.testsApproved,
    preview: {
      settingsDigest: review.settingsDigest,
      sourceDigest: submission.digest,
      ...(submission.executionSelection
        ? { executionSelection: summarizeExecutionSelection(submission.executionSelection) }
        : {}),
      services: review.selection.services.slice(0, 50),
      serviceCount: review.selection.services.length,
      dependencies: Object.entries(review.dependencies ?? {})
        .slice(0, 50)
        .map(([name, kinds]) => ({ name, kind: kinds.join(", ") })),
      dependencyCount: Object.keys(review.dependencies ?? {}).length,
      tests: submission.files.slice(0, 50).map((file) => {
        const scenarios =
          submission.parsed?.find((item) => item.path === file.path)?.review.scenarios ?? []
        return {
          path: file.path,
          scenarios: scenarios.slice(0, 20).map((item) => boundedText(item.title)),
          scenarioCount: scenarios.length,
        }
      }),
      testFileCount: submission.files.length,
    },
  }
  if (!run) {
    context.path = review.path
    context.cleanup = { state: "not_started", issues: [] }
    context.evidence = []
    if (review.error) {
      context.failures.push({
        scope: "admission",
        classification: review.state,
        message: review.error,
      })
    }
  }
  return boundReview(context)
}
function otherRunContext(kind: Identity["kind"], run: UnitRun | CaptureRun): ReviewContext {
  return kind === "unit"
    ? unitReviewContext(run as UnitRun)
    : playwrightReviewContext(run as CaptureRun)
}
function otherExecutionContext(services: Services, input: Identity): ReviewContext {
  const pending = services.executionReviews?.get(input.id)
  if (!pending) {
    if (input.kind === "unit") {
      return boundReview(
        unitReviewContext(
          (
            services.unitTests ?? problem("settings_unsupported", "Unit evidence is unavailable")
          ).get(input.id),
        ),
      )
    }
    return boundReview(
      playwrightReviewContext(
        (
          services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
        ).get(input.id),
      ),
    )
  }
  const { review, run } = pending
  if (review.kind !== input.kind) {
    problem("not_found", "The review belongs to a different execution kind")
  }
  const context = run
    ? otherRunContext(input.kind, run)
    : reviewSummaryBase(input.kind, review, { ...review, projectRoot: review.path })
  context.id = input.id
  context.executionId = run?.id ?? null
  context.reviewPath = reviewPath(input.kind, input.id, review)
  context.approval = {
    requestId: review.id,
    policy: review.policy,
    state: review.state,
    revision: review.revision,
    preview: {
      settingsDigest: review.settingsDigest,
      inputDigest: review.inputDigest,
      ...(review.executionSelection
        ? { executionSelection: summarizeExecutionSelection(review.executionSelection) }
        : {}),
      ...(review.sourceDigest ? { sourceDigest: review.sourceDigest } : {}),
      ...("command" in review.specification
        ? {
            command: review.specification.fileCommand
              ? JSON.stringify([
                  review.specification.fileCommand.executable,
                  ...review.specification.fileCommand.args,
                ])
              : review.specification.command,
            cwd: review.specification.cwd,
            dockerfile: review.specification.dockerfile,
          }
        : {
            target: review.specification.target,
            purpose: review.specification.purpose,
            viewport: review.specification.viewport,
          }),
    },
  }
  if (!run) {
    context.intent = boundedText(
      "command" in review.specification
        ? review.specification.command
        : review.specification.target,
    )
    context.cleanup = { state: "not_started", issues: [] }
    context.evidence = []
    if (review.error) {
      context.failures.push({
        scope: "admission",
        classification: review.state,
        message: review.error,
      })
    }
  }
  return boundReview(context)
}
export function getReviewContext(services: Services, input: Identity): ReviewContext {
  return input.kind === "integration"
    ? integrationContext(services, input.id)
    : otherExecutionContext(services, input)
}
export async function approveReview(
  services: Services,
  input: Identity & { revision: number; subject?: "environment" | "tests" },
): Promise<ReviewContext> {
  if (input.kind === "integration") {
    const reviews =
      services.reviews ?? problem("settings_unsupported", "Integration approval is unavailable")
    await reviews.approve({
      id: input.id,
      token: reviews.capability(input.id),
      revision: input.revision,
      subject: input.subject ?? problem("invalid_input", "Integration approval requires subject"),
    })
  } else {
    if (input.subject) {
      problem("invalid_input", "Unit and Playwright approvals have no subject")
    }
    const reviews =
      services.executionReviews ??
      problem("settings_unsupported", "Execution approval is unavailable")
    if (reviews.get(input.id)?.review.kind !== input.kind) {
      problem("not_found", "Execution review not found")
    }
    await reviews.approve({
      id: input.id,
      token: reviews.capability(input.id),
      revision: input.revision,
    })
  }
  return getReviewContext(services, input)
}
export async function cancelReview(services: Services, input: Identity): Promise<ReviewContext> {
  const pending = services.executionReviews?.get(input.id)
  if (pending && pending.review.kind !== input.kind) {
    problem("not_found", "The review belongs to a different execution kind")
  }
  await cancelExecution(services, input.kind, input.id)
  return getReviewContext(services, input)
}
