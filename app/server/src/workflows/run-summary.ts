import { boundedText } from "../core/chat-context.js"
import { summarizeExecutionSelection } from "../core/execution-selection.js"
import { problem } from "../core/problems.js"
import type { CaptureRun } from "../core/types/playwright.js"
import { getReviewContext } from "./chat-context.js"
import type { Services } from "./services.js"

type Identity = { kind: "integration" | "unit" | "playwright"; id: string }
function artifactSummary(run: CaptureRun) {
  const artifacts = []
  let artifactCount = 0
  for (const side of ["before", "after"] as const) {
    for (const item of run[side].cases) {
      for (const artifact of item.artifacts) {
        artifactCount++
        if (artifacts.length < 20) {
          artifacts.push({
            ...artifact,
            name: boundedText(artifact.name),
            side,
            retrieval: {
              tool: "get_run_artifact",
              arguments: { kind: "playwright", id: run.id, artifactId: artifact.id, side },
            },
          })
        }
      }
    }
  }
  return { artifacts, artifactCount }
}

/** Model-facing result projection; full case bodies and output stay behind detail/viewer reads. */
export function getRunSummary(services: Services, input: Identity) {
  const context = getReviewContext(services, input)
  const { preview, ...approval } = context.approval ?? {}
  const base = {
    ...context,
    state: context.state === "pending" ? "awaiting_approval" : context.state,
    approval: context.approval ? approval : null,
    failures: context.failures.map((failure) => ({
      ...failure,
      ...(failure.file ? { file: boundedText(failure.file) } : {}),
    })),
    truncated:
      context.failureCount > context.failures.length ||
      context.evidenceCount > context.evidence.length ||
      context.failures.some(
        (item) =>
          item.message.length === 2048 ||
          (item.case?.length ?? 0) >= 2048 ||
          (item.file?.length ?? 0) > 2048,
      ) ||
      context.evidence.some((item) => item.label.length === 2048) ||
      context.cleanup.issues.some((issue) => issue.length === 2048),
  }
  if (!context.executionId) {
    return {
      ...base,
      executionSelection: preview?.executionSelection ?? null,
      identity: {
        settingsDigest: preview?.settingsDigest,
        inputDigest: preview?.inputDigest,
        sourceDigest: preview?.sourceDigest,
      },
      artifacts: [],
      artifactCount: 0,
      caseCount: 0,
    }
  }
  if (input.kind === "integration") {
    const run = services.runs.get(context.executionId)
    const submission = services.submissions.get(run.submissionId)
    return {
      ...base,
      identity: {
        submissionId: run.submissionId,
        sourceDigest: submission.digest,
        settingsDigest: run.settings?.digest,
      },
      executionSelection: summarizeExecutionSelection(submission.executionSelection),
      caseCount: run.result?.cases.length ?? 0,
      artifacts: [],
      artifactCount: 0,
    }
  }
  if (input.kind === "unit") {
    const run = (
      services.unitTests ?? problem("settings_unsupported", "Unit evidence is unavailable")
    ).get(context.executionId)
    return {
      ...base,
      identity: { inputDigest: run.inputDigest },
      executionSelection: summarizeExecutionSelection(run.executionSelection),
      exitCode: run.exitCode,
      artifacts: [],
      artifactCount: 0,
      caseCount: null,
    }
  }
  const run = (
    services.captures ?? problem("settings_unsupported", "Playwright evidence is unavailable")
  ).get(context.executionId)
  const artifacts = artifactSummary(run)
  return {
    ...base,
    ...artifacts,
    executionSelection: summarizeExecutionSelection(run.executionSelection),
    truncated: base.truncated || artifacts.artifactCount > artifacts.artifacts.length,
    identity: {
      sourceDigest: run.sourceDigest,
      settingsDigest: run.settingsDigest,
      appDigest: run.appDigest,
      revision: run.revision,
    },
    caseCount: run.before.cases.length + run.after.cases.length,
  }
}
