import { resolve } from "node:path"
import type { z } from "zod"
import { problem } from "../core/problems.js"
import type { executionReadInput, playwrightExecutionInput } from "../core/verification-schema.js"
import type { Services } from "./services.js"

type Kind = "integration" | "unit" | "playwright"
function worktrees(services: Services) {
  return services.worktrees ?? problem("worktree_unavailable", "Worktree service is unavailable")
}
async function executionCheckout(services: Services, path: string) {
  if (services.reviews?.policy() === "ask") {
    problem(
      "invalid_input",
      "Unit and Playwright MCP execution require Auto policy. Under Ask, start them explicitly in the viewer; MCP cannot grant or change approval.",
    )
  }
  const service = worktrees(services)
  const project = await service.connect(path)
  return service.ensure(project.id, path)
}
export async function runUnitVerification(services: Services, path: string) {
  const units =
    services.unitTests ?? problem("settings_unsupported", "Unit execution is unavailable")
  const checkout = await executionCheckout(services, path)
  return units.start(checkout.id)
}
export async function runPlaywrightVerification(
  services: Services,
  input: z.infer<typeof playwrightExecutionInput>,
) {
  const captures =
    services.captureWorkflow ??
    problem("settings_unsupported", "Playwright execution is unavailable")
  const checkout = await executionCheckout(services, input.path)
  return captures.start(checkout.id, undefined, input.viewport, input.target)
}
export async function listExecutions(services: Services, path: string, before?: string) {
  const service = worktrees(services)
  for (const project of await service.listProjects()) {
    const checkout = (await service.listWorktrees(project.id)).find(
      (item) => resolve(item.projectRoot) === resolve(path),
    )
    if (checkout) {
      return {
        path: checkout.projectRoot,
        worktreeId: checkout.id,
        ...services.runs.listForWorktree(checkout.id, before),
      }
    }
  }
  return { path, worktreeId: null, items: [], nextCursor: null }
}
export async function readExecution(services: Services, input: z.infer<typeof executionReadInput>) {
  const { kind, id, detail } = input
  if (detail === "log") {
    return { kind, id, ...(await services.runs.copyLog(kind, id)) }
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
