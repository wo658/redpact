import { problem } from "../core/problems.js"
import type { Store } from "../core/types/contracts.js"
import type {
  ExecutionSources,
  ExecutionSummary,
  RunLogReader,
  RunLogs,
} from "../core/types/run-logs.js"

function stream(name: string, value: RunLogs["stdout"]) {
  if (!value) {
    return `${name}: not recorded`
  }
  return `${name}:\n${value.text || "(empty)"}${value.truncated ? "\n[Output truncated]" : ""}`
}
function metadata(
  kind: string,
  run: { id: string; state: string; createdAt: string; finishedAt?: string | null },
  outcome?: string | null,
) {
  return [
    `Type: ${kind}`,
    `ID: ${run.id}`,
    `State: ${run.state}`,
    `Outcome: ${outcome ?? "not recorded"}`,
    `Created: ${run.createdAt}`,
    `Finished: ${run.finishedAt ?? "not recorded"}`,
  ].join("\n")
}
export async function executionText(
  kind: ExecutionSummary["kind"],
  id: string,
  store: Store,
  sources: ExecutionSources,
  readLogs?: RunLogReader,
) {
  if (kind === "unit") {
    const run =
      sources.units().find((run) => run.id === id) ?? problem("not_found", "Unit run not found")
    return [
      metadata(kind, run, run.outcome),
      `Command: ${run.settings.command}`,
      `Exit code: ${run.exitCode ?? "not recorded"}`,
      run.error,
      run.cleanup.error,
      stream("stdout", { text: run.stdout, truncated: run.truncated }),
      stream("stderr", { text: run.stderr, truncated: run.truncated }),
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  if (kind === "playwright") {
    const run =
      sources.captures().find((run) => run.id === id) ??
      problem("not_found", "Playwright run not found")
    const sides = (["before", "after"] as const).map((name) => {
      const side = run[name]
      return [
        `${name}: ${side.state}`,
        side.outcome,
        side.error,
        ...side.cases.map((result) =>
          [
            `${result.file}: ${result.title} (${result.status})`,
            ...result.errors,
            ...result.steps.map((step) => `${step.title}${step.error ? `: ${step.error}` : ""}`),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      ]
        .filter(Boolean)
        .join("\n")
    })
    return [
      metadata(kind, run, run.outcome),
      `Target: ${run.target}`,
      `Scope: ${run.scope ?? "project"}`,
      `Purpose: ${run.purpose}`,
      run.error,
      run.cleanupError,
      ...sides,
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  const run = store.getRun(id) ?? problem("not_found", "Run not found")
  if (!readLogs) {
    throw new Error("Run log reader is unavailable")
  }
  const logs = await readLogs(id)
  return [
    metadata(kind, run, run.result?.outcome),
    ...(run.result?.errors ?? []),
    ...(run.result?.cases ?? []).flatMap((result) =>
      result.errors.map(
        (error) => `${result.name}: ${error.stack || `${error.name}: ${error.message}`}`,
      ),
    ),
    stream("stdout", logs.stdout),
    stream("stderr", logs.stderr),
  ].join("\n\n")
}
