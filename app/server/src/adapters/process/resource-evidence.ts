import { performance } from "node:perf_hooks"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"

export function resourceEvidence(
  limits: TestResources,
  started: number,
  source: ResourceLimit["source"],
  target: ResourceLimit["termination"]["target"],
  observedMiB: number | null = null,
): ResourceLimit {
  return {
    kind: source === "wall_clock" ? "time" : "memory",
    source,
    limits: { ...limits },
    detectedAt: new Date().toISOString(),
    elapsedMs: performance.now() - started,
    observedMiB,
    termination: { target, confirmed: false, exitCode: null, signal: null },
  }
}

export function resourceMessage(record: ResourceLimit): string {
  const limit =
    record.kind === "time"
      ? `Time limit exceeded (${record.limits.timeoutSeconds} seconds)`
      : `Memory limit exceeded (${record.limits.memoryMiB} MiB)`
  const observed = record.observedMiB === null ? "not measured" : `${record.observedMiB} MiB`
  return `${limit}; source=${record.source}; detectedAt=${record.detectedAt}; elapsedMs=${Math.round(record.elapsedMs)}; observedMemory=${observed}; terminationTarget=${record.termination.target}; terminationConfirmed=${record.termination.confirmed}; commandExitCode=${record.termination.exitCode}; commandSignal=${record.termination.signal}`
}
