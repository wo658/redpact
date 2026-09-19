import { problem } from "./problems.js"
import type { Environment } from "./types/environment.js"

export function assertEnvironmentReservation(
  record: Pick<Environment, "ownerId" | "state" | "runId" | "runIds" | "settingsDigest"> & {
    target: Pick<Environment["target"], "worktreeId">
  },
  request: { worktreeId: string; ownerId: string; runId: string; settingsDigest: string },
): void {
  if (record.target.worktreeId !== request.worktreeId || record.ownerId !== request.ownerId) {
    problem("environment_conflict", "Environment belongs to another target")
  }
  if (
    record.state !== "ready" ||
    record.runId ||
    record.runIds.length !== 1 ||
    record.runIds[0] !== request.runId
  ) {
    problem(
      "environment_conflict",
      "Environment belongs to a single execution and cannot be reused",
    )
  }
  if (record.settingsDigest !== request.settingsDigest) {
    problem("environment_conflict", "Inputs changed; prepare a new environment")
  }
}

export function observedEnvironmentState(
  state: Environment["state"],
  healthy: boolean,
): Environment["state"] {
  if (!healthy && (state === "ready" || state === "in_use")) {
    return "unavailable"
  }
  return state
}

export function interruptedEnvironment(
  state: Environment["state"],
): Partial<Environment> | undefined {
  if (state === "preparing") {
    return { state: "failed", errors: ["Preparation was interrupted; resources retained"] }
  }
  if (state === "stopping") {
    return { state: "stop_failed", errors: ["Stop was interrupted; retry explicit stop"] }
  }
  if (state === "in_use") {
    return { state: "completed", runId: undefined, errors: ["Test execution was interrupted"] }
  }
  return undefined
}
