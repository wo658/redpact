import type { z } from "zod"
import { problem } from "../core/problems.js"
import type { executionIdentity, runTestsInput } from "../core/verification-schema.js"
import { getRunSummary } from "./run-summary.js"
import type { Services } from "./services.js"
import { runPlaywrightVerification, runUnitVerification } from "./verification.js"

type Identity = z.infer<typeof executionIdentity>
export async function requestAgentTests(services: Services, input: z.infer<typeof runTestsInput>) {
  const reviews =
    services.reviews ?? problem("settings_unsupported", "Execution approval is unavailable")
  if (input.kind === "integration") {
    const value = await reviews.start(input)
    return getRunSummary(services, { kind: input.kind, id: value.review.id })
  }
  const value =
    input.kind === "unit"
      ? await runUnitVerification(services, input.path, input.executionScope)
      : await runPlaywrightVerification(services, input)
  return getRunSummary(services, {
    kind: input.kind,
    id: "review" in value ? value.review.id : value.run.id,
  })
}

export async function observedAgentWorkspace(services: Services, path: string) {
  const worktrees =
    services.worktrees ?? problem("worktree_unavailable", "Worktree service is unavailable")
  return (
    (await worktrees.observed(path)) ??
    problem("not_found", "Connect the project before using its checkout")
  )
}

export function listAgentArtifacts(services: Services, input: Identity, offset: number) {
  if (input.kind !== "playwright") {
    return { items: [], nextCursor: null }
  }
  const summary = getRunSummary(services, input)
  if (!summary.executionId) {
    return { items: [], nextCursor: null }
  }
  const captures =
    services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
  const run = captures.get(summary.executionId)
  const artifacts = (["before", "after"] as const).flatMap((side) =>
    run[side].cases.flatMap((item) => item.artifacts.map((artifact) => ({ ...artifact, side }))),
  )
  return {
    items: artifacts.slice(offset, offset + 20),
    artifactCount: artifacts.length,
    nextCursor: offset + 20 < artifacts.length ? String(offset + 20) : null,
  }
}

export function stopAgentRuntime(services: Services) {
  const control =
    services.runtimeControl ?? problem("settings_unsupported", "Runtime control is unavailable")
  control.stop()
  return { state: "stopping" }
}

export async function requestAgentSubmission(services: Services, id: string) {
  const submission = services.submissions.get(id)
  const path =
    submission.projectRoot ??
    problem("worktree_unavailable", "Submission has no execution checkout")
  const reviews =
    services.reviews ?? problem("settings_unsupported", "Execution approval is unavailable")
  const value = await reviews.start({ path, submissionId: id })
  return getRunSummary(services, { kind: "integration", id: value.review.id })
}
