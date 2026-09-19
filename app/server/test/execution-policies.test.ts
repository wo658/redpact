import { expect, test, vi } from "vitest"
import {
  assertEnvironmentReservation,
  interruptedEnvironment,
  observedEnvironmentState,
} from "../src/core/environment-policy.js"
import {
  assertEnvironmentBinding,
  assertRunAdmission,
  decideRunResult,
  executionFailureOutcome,
  finishRun,
} from "../src/core/run-policy.js"
import type { Run, RunResult, Store } from "../src/core/types/contracts.js"
import { createRuns } from "../src/workflows/runs.js"

const result: RunResult = { outcome: "passed", cases: [], errors: [] }
const run: Run = {
  id: "run",
  submissionId: "submission",
  state: "queued",
  result: null,
  createdAt: "accepted",
  finishedAt: null,
  limitations: [],
}

test("잘못된 실행 수락 입력은 저장소를 조회하기 전에 거절한다", () => {
  const getRun = vi.fn(() => {
    throw new Error("Storage must not be read")
  })
  const service = createRuns({
    store: { getRun } as unknown as Store,
    runner: { version: "test", execute: vi.fn() },
  })
  expect(() => service.accept({ ...run, state: "finished" })).toThrow("A new run must begin queued")
  expect(getRun).not.toHaveBeenCalled()
})

test("종료된 실행의 판정과 종료 시각은 후속 결과로 덮어쓰지 않는다", () => {
  const finished = finishRun(run, result, "first")
  expect(finished).toEqual({ ...run, state: "finished", result, finishedAt: "first" })
  expect(finishRun(finished, { ...result, outcome: "cancelled" }, "later")).toBe(finished)
  expect(run.state).toBe("queued")
})

test("실행 수락은 신규 대기 기록만 허용한다", () => {
  expect(() => assertRunAdmission(run, false)).not.toThrow()
  for (const invalid of [
    { ...run, state: "running" as const },
    { ...run, result },
    { ...run, finishedAt: "done" },
  ]) {
    expect(() => assertRunAdmission(invalid, false)).toThrow("A new run must begin queued")
  }
  expect(() => assertRunAdmission(run, true)).toThrow("A new run must begin queued")
})

test("취소와 환경 장애가 겹쳐도 결과 판정 우선순위와 수집된 증거를 보존한다", () => {
  expect(
    decideRunResult(result, { userCancelled: true, environmentLost: true, aborted: true }).outcome,
  ).toBe("cancelled")
  const failed = decideRunResult(result, {
    userCancelled: false,
    environmentLost: true,
    aborted: true,
  })
  expect(failed.outcome).toBe("environment_error")
  expect(failed.cases).toBe(result.cases)
  expect(failed.errors).toEqual(["Required environment service was lost"])
  expect(result.errors).toEqual([])
  expect(
    decideRunResult(result, { userCancelled: false, environmentLost: false, aborted: false }),
  ).toBe(result)
})

test("환경 예약은 소유 대상과 최초 실행의 준비 상태를 함께 검증한다", () => {
  const environment = {
    target: { worktreeId: "wt" },
    ownerId: "owner",
    state: "ready" as const,
    runIds: ["run"],
    settingsDigest: "digest",
  }
  const request = { worktreeId: "wt", ownerId: "owner", runId: "run", settingsDigest: "digest" }
  expect(() => assertEnvironmentReservation(environment, request)).not.toThrow()
  expect(() => assertEnvironmentReservation(environment, { ...request, ownerId: "other" })).toThrow(
    "another target",
  )
  expect(() =>
    assertEnvironmentReservation({ ...environment, state: "completed" }, request),
  ).toThrow("cannot be reused")
  expect(() => assertEnvironmentReservation(environment, { ...request, runId: "other" })).toThrow(
    "cannot be reused",
  )
  expect(() =>
    assertEnvironmentReservation(environment, { ...request, settingsDigest: "changed" }),
  ).toThrow("Inputs changed")
})

test("제한 초과는 사용자 취소와 환경 장애보다 우선한다", () => {
  const limited: RunResult = {
    ...result,
    resourceLimit: {
      kind: "time",
      source: "wall_clock",
      limits: { memoryMiB: 2048, timeoutSeconds: 600 },
      detectedAt: "2026-09-18T00:00:00.000Z",
      elapsedMs: 600000,
      observedMiB: null,
      termination: { target: "process_group", confirmed: true, exitCode: null, signal: "SIGTERM" },
    },
  }
  expect(
    decideRunResult(limited, { userCancelled: true, environmentLost: true, aborted: true }),
  ).toBe(limited)
  expect(
    decideRunResult(result, { userCancelled: false, environmentLost: false, aborted: true })
      .outcome,
  ).toBe("cancelled")
})

test("취소와 경합한 환경 준비 결과는 기록하되 중복 연결은 거절한다", () => {
  expect(() => assertEnvironmentBinding({ ...run, state: "finished" }, true)).not.toThrow()
  expect(() => assertEnvironmentBinding({ ...run, environmentId: "env" }, true)).toThrow(
    "Only a queued local run",
  )
  expect(() => assertEnvironmentBinding({ ...run, state: "running" }, true)).toThrow(
    "Only a queued local run",
  )
  expect(() => assertEnvironmentBinding(run, false)).toThrow("Only a queued local run")
})

test("실행 예외 분류는 취소를 우선하고 알려진 오류만 설정 또는 환경 오류로 분류한다", () => {
  expect(executionFailureOutcome(true, "settings_invalid")).toBe("cancelled")
  expect(executionFailureOutcome(false, "worktree_unavailable")).toBe("configuration_error")
  expect(executionFailureOutcome(false, "environment_conflict")).toBe("environment_error")
  expect(executionFailureOutcome(false, undefined)).toBe("execution_error")
})

test("늦은 상태 관찰은 완료 또는 종료 중인 환경을 실행 중 상태로 되돌리지 않는다", () => {
  expect(observedEnvironmentState("in_use", false)).toBe("unavailable")
  expect(observedEnvironmentState("ready", false)).toBe("unavailable")
  for (const state of ["completed", "stopping", "stopped", "stop_failed"] as const) {
    expect(observedEnvironmentState(state, true)).toBe(state)
    expect(observedEnvironmentState(state, false)).toBe(state)
  }
})

test("재시작은 중단된 작업의 자원 보존과 재시도 상태를 구분한다", () => {
  expect(interruptedEnvironment("preparing")).toEqual({
    state: "failed",
    errors: ["Preparation was interrupted; resources retained"],
  })
  expect(interruptedEnvironment("stopping")).toEqual({
    state: "stop_failed",
    errors: ["Stop was interrupted; retry explicit stop"],
  })
  expect(interruptedEnvironment("in_use")).toEqual({
    state: "completed",
    runId: undefined,
    errors: ["Test execution was interrupted"],
  })
  expect(interruptedEnvironment("ready")).toBeUndefined()
})
