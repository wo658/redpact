import type { z } from "zod"
import { problem } from "../core/problems.js"
import type { ExecutionScope } from "../core/types/execution-selection.js"
import type { executionReadInput, playwrightExecutionInput } from "../core/verification-schema.js"
import type { Services } from "./services.js"

type Kind = "integration" | "unit" | "playwright"
function worktrees(services: Services) {
  return services.worktrees ?? problem("worktree_unavailable", "Worktree service is unavailable")
}
async function executionCheckout(services: Services, path: string) {
  const service = worktrees(services)
  const project = await service.connect(path)
  return service.ensure(project.id, path)
}
export async function runUnitVerification(
  services: Services,
  path: string,
  executionScope?: ExecutionScope,
) {
  if (services.reviews?.policy() === "ask") {
    const reviews =
      services.executionReviews ??
      problem("settings_unsupported", "Execution approval is unavailable")
    return reviews.request({ kind: "unit", path, executionScope })
  }
  const units =
    services.unitTests ?? problem("settings_unsupported", "Unit execution is unavailable")
  const checkout = await executionCheckout(services, path)
  return { kind: "unit" as const, run: await units.start(checkout.id, undefined, executionScope) }
}
export async function runPlaywrightVerification(
  services: Services,
  input: z.infer<typeof playwrightExecutionInput>,
) {
  if (services.reviews?.policy() === "ask") {
    const reviews =
      services.executionReviews ??
      problem("settings_unsupported", "Execution approval is unavailable")
    return reviews.request({ kind: "playwright", ...input })
  }
  const captures =
    services.captureWorkflow ??
    problem("settings_unsupported", "Playwright execution is unavailable")
  const checkout = await executionCheckout(services, input.path)
  return {
    kind: "playwright" as const,
    run: await captures.start(
      checkout.id,
      undefined,
      input.viewport,
      input.target,
      undefined,
      input.executionScope,
    ),
  }
}
export async function listExecutions(
  services: Services,
  path: string,
  before?: string,
  kind?: Kind,
) {
  const checkout = await worktrees(services).observed(path)
  if (checkout) {
    return {
      path,
      worktreeId: checkout.worktreeId,
      ...services.runs.listForWorktree(checkout.worktreeId, before, kind),
    }
  }
  return { path, worktreeId: null, items: [], nextCursor: null }
}
export async function readExecution(services: Services, input: z.infer<typeof executionReadInput>) {
  const { kind, id, detail } = input
  const integrationReview = kind === "integration" ? services.reviews?.get(id) : undefined
  if (integrationReview && detail !== "result") {
    if (!integrationReview.run) {
      problem("invalid_input", "Pending reviews have no execution evidence yet")
    }
    if (id !== integrationReview.run.id) {
      return readExecution(services, { ...input, id: integrationReview.run.id })
    }
  }
  const executionReview = services.executionReviews?.get(id)
  if (executionReview) {
    if (executionReview.review.kind !== kind) {
      problem("not_found", "Execution review kind does not match")
    }
    if (detail === "result") {
      return { kind, ...executionReview }
    }
    if (!executionReview.run) {
      problem("invalid_input", "Pending reviews have no execution evidence yet")
    }
    if (id !== executionReview.run.id) {
      return readExecution(services, { ...input, id: executionReview.run.id })
    }
  }
  if (detail === "log") {
    const { text } = await services.runs.copyLog(kind, id)
    return { kind, id, text: text.slice(0, 65536), truncated: text.length > 65536 }
  }
  if (detail === "source") {
    const path = input.sourcePath ?? problem("invalid_input", "sourcePath is required")
    if (kind === "playwright") {
      const captures =
        services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
      return { kind, id, path, source: await captures.source(id, path) }
    }
    const run = services.runs.get(id)
    const submission = services.submissions.get(run.submissionId)
    const file =
      submission.files.find((item) => item.path === path) ??
      problem("not_found", "File is not in the recorded submission")
    return { kind, id, submissionId: submission.id, digest: submission.digest, ...file }
  }
  if (kind === "playwright") {
    const captures =
      services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
    const run = captures.get(id)
    if (detail === "image") {
      return readPlaywrightImage(services, input)
    }
    return { kind, run }
  }
  if (kind === "unit") {
    return {
      kind,
      run: (
        services.unitTests ?? problem("settings_unsupported", "Unit evidence is unavailable")
      ).get(id),
    }
  }
  const review = services.reviews?.get(id)
  if (review) {
    return { kind, review: review.review, run: review.run, submissionId: review.submission.id }
  }
  return { kind, run: services.runs.get(id) }
}
export async function cancelExecution(services: Services, kind: Kind, id: string) {
  const review = services.executionReviews?.get(id)
  if (review) {
    if (review.review.kind !== kind) {
      problem("not_found", "Execution review kind does not match")
    }
    return { kind, ...(await services.executionReviews!.cancel(id)) }
  }
  if (kind === "unit") {
    return {
      kind,
      run: await (
        services.unitTests ?? problem("settings_unsupported", "Unit execution is unavailable")
      ).cancel(id),
    }
  }
  if (kind === "playwright") {
    return {
      kind,
      run: await (
        services.captureWorkflow ??
        problem("settings_unsupported", "Playwright execution is unavailable")
      ).cancel(id),
    }
  }
  if (services.reviews?.get(id)) {
    const view = await services.reviews.cancel(id)
    return { kind, review: view?.review, run: view?.run }
  }
  return { kind, run: services.executeTests.cancel(id) }
}

async function readPlaywrightImage(services: Services, input: z.infer<typeof executionReadInput>) {
  const { kind, id } = input
  const captures =
    services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
  const run = captures.get(id)
  const artifactId = input.artifactId ?? problem("invalid_input", "artifactId is required")
  const artifact =
    run[input.side].cases
      .flatMap((item) => item.artifacts)
      .find((item) => item.id === artifactId) ?? problem("not_found", "Recorded image not found")
  if (artifact.contentType !== "image/png" || artifact.bytes > 8 * 1024 * 1024) {
    problem("invalid_input", "Use the viewer for video, trace, or images larger than 8 MiB")
  }
  const content = await captures.artifact(id, input.side, artifactId)
  if (content.contentType !== "image/png" || content.data.byteLength > 8 * 1024 * 1024) {
    problem("invalid_input", "Image content is unsupported or too large")
  }
  return { kind, id, artifact, image: content.data }
}

export async function projectContainer(
  services: Services,
  path: string,
  action: "inspect" | "start" | "restart" | "stop",
) {
  const checkout = await worktrees(services).observed(path)
  if (!checkout || checkout.disconnected) {
    problem("not_found", "Connect the project before managing its manual container")
  }
  const container =
    services.testContainer ??
    problem("settings_unsupported", "Manual container workflow is unavailable")
  return container[action](checkout.projectId, checkout.worktreeId)
}

export async function readRunArtifact(
  services: Services,
  input: { kind: "playwright"; id: string; artifactId: string; side: "before" | "after" },
) {
  const review = services.executionReviews?.get(input.id)
  if (review && review.review.kind !== input.kind) {
    problem("not_found", "Execution review kind does not match")
  }
  if (review && !review.run) {
    problem("invalid_input", "Pending reviews have no execution evidence yet")
  }
  const id = review?.run?.id ?? input.id
  const captures =
    services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
  const run = captures.get(id)
  const artifact =
    run[input.side].cases
      .flatMap((item) => item.artifacts)
      .find((item) => item.id === input.artifactId) ??
    problem("not_found", "Artifact does not belong to this execution and side")
  if (artifact.bytes > 8 * 1024 * 1024) {
    problem("invalid_input", "Use the viewer for artifacts larger than 8 MiB")
  }
  const content = await captures.artifact(id, input.side, input.artifactId)
  if (content.data.byteLength > 8 * 1024 * 1024 || content.contentType !== artifact.contentType) {
    problem("invalid_input", "Artifact content is unsupported or too large")
  }
  return { kind: input.kind, id, artifact, data: content.data }
}
