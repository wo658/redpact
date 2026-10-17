import assert from "node:assert/strict"
import { test } from "node:test"
import { aggregateConditions } from "./report.ts"

const row = (
  condition: "A" | "B" | "C",
  repetition: number,
  status: "passed" | "failed" | "infrastructure_error",
  tokens: number | null,
  elapsedMs: number | null,
) => ({
  condition,
  taskId: "api",
  repetition,
  measurement: {
    summary: {
      status: status === "passed" ? "completed" : "failed",
      elapsedMs,
      usage: { inputTokens: tokens, cachedInputTokens: 0, outputTokens: 0, totalTokens: tokens },
    },
  },
  evaluation: {
    status,
    tests: 2,
    passed: status === "passed" ? 2 : 1,
    failed: status === "passed" ? 0 : 1,
    accuracy: status === "infrastructure_error" ? null : 0.5,
    infrastructureError: null,
  },
})

test("실패 실행 비용도 포함하고 과제 성공률과 테스트 통과율을 분리한다", () => {
  const [result] = aggregateConditions([
    row("A", 1, "passed", 10, 100),
    row("A", 2, "failed", 30, 300),
  ])
  assert.equal(result.runs, 2)
  assert.equal(result.taskSuccessRate, 0.5)
  assert.equal(result.testPassRate, 0.75)
  assert.equal(result.totalTokens, 40)
  assert.equal(result.tokensPerSuccessfulTask, 40)
  assert.equal(result.elapsedMs.sum, 400)
  assert.equal(result.elapsedMs.median, 200)
})
test("인프라 실패와 누락 계측은 0이나 부분 합계로 바꾸지 않는다", () => {
  const [result] = aggregateConditions([
    row("B", 1, "passed", 10, 100),
    row("B", 2, "infrastructure_error", null, null),
  ])
  assert.equal(result.infrastructureErrors, 1)
  assert.equal(result.evaluatedTasks, 1)
  assert.equal(result.taskSuccessRate, null)
  assert.equal(result.testPassRate, null)
  assert.equal(result.totalTokens, null)
  assert.equal(result.tokensPerSuccessfulTask, null)
  assert.equal(result.elapsedMs.sum, null)
  assert.equal(result.elapsedMs.observedSum, 100)
})
test("동일 조건 과제 반복의 중복 집계를 거부한다", () => {
  const repeated = row("C", 1, "passed", 1, 1)
  assert.throws(() => aggregateConditions([repeated, repeated]), /Duplicate/)
})
