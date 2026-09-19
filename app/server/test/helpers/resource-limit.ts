import type { ResourceLimit } from "../../src/core/types/test-resources.js"

export const resourceLimit: ResourceLimit = {
  kind: "memory",
  source: "docker_oom",
  limits: { memoryMiB: 64, timeoutSeconds: 10 },
  detectedAt: "2026-09-11T15:00:00.000Z",
  elapsedMs: 250,
  observedMiB: null,
  termination: { target: "container", confirmed: true, exitCode: 137, signal: null },
}
