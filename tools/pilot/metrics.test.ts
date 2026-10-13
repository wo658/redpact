import assert from "node:assert/strict"
import { test } from "node:test"
import { summarizeRun } from "./metrics.ts"

const trace = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join("\n")
const metadata = { elapsedMs: 1250, exitCode: 0 }

test("완료 이벤트의 입력과 캐시를 중복 합산하지 않는다", () => {
  const summary = summarizeRun(
    trace(
      { type: "turn.started" },
      {
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 },
      },
      {
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 },
      },
      { type: "turn.started" },
      {
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 },
      },
    ),
    metadata,
  )
  assert.equal(summary.usage.inputTokens, 200)
  assert.equal(summary.usage.cachedInputTokens, 160)
  assert.equal(summary.usage.uncachedInputTokens, 40)
  assert.equal(summary.usage.totalTokens, 220)
  assert.equal(summary.duplicateTerminalEvents, 1)
  assert.equal(summary.usage.reasoningOutputTokens, null)
})

test("실패 및 누락 사용량을 0이나 성공으로 보고하지 않는다", () => {
  const summary = summarizeRun(
    trace({ type: "turn.started" }, { type: "turn.failed", error: { message: "failed" } }),
    { elapsedMs: 30, exitCode: 1, infrastructureError: "runner unavailable" },
  )
  assert.equal(summary.usage.inputTokens, null)
  assert.equal(summary.usage.complete, false)
  assert.equal(summary.status, "failed")
  assert.equal(summary.infrastructureError, "runner unavailable")
  assert.equal(summary.elapsedMs, 30)
})

test("도구 시작과 완료를 한 번만 세고 결과 바이트를 측정한다", () => {
  const command = { id: "one", type: "command_execution", aggregated_output: "ok" }
  const summary = summarizeRun(
    trace(
      { type: "thread.started", thread_id: "thread-1" },
      { type: "item.started", item: command },
      { type: "item.completed", item: command },
      { type: "item.completed", item: command },
      {
        type: "item.completed",
        item: { id: "two", type: "mcp_tool_call", result: { content: [] } },
      },
    ),
    metadata,
  )
  assert.equal(summary.threadId, "thread-1")
  assert.deepEqual(summary.toolCalls, { command: 1, mcp: 1, webSearch: 0 })
  assert.equal(summary.toolOutputBytes, 16)
  assert.equal(summary.status, "incomplete")
})

test("잘린 JSON과 잘못된 토큰 값을 정직하게 표시한다", () => {
  const summary = summarizeRun(
    `${trace({
      type: "turn.completed",
      usage: { input_tokens: 3, cached_input_tokens: 4, output_tokens: -1 },
    })}\n{broken`,
    metadata,
  )
  assert.equal(summary.malformedLines, 1)
  assert.equal(summary.usage.complete, false)
  assert.equal(summary.usage.cachedInputTokens, null)
  assert.equal(summary.usage.outputTokens, null)
  assert.equal(summary.usage.totalTokens, null)
  assert.equal(summary.peakContextTokens, null)
  assert.equal(summary.compactionCount, null)
})

test("일부 turn 사용량이 누락되면 부분합을 전체 사용량으로 노출하지 않는다", () => {
  const summary = summarizeRun(
    trace(
      { type: "turn.started" },
      {
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 5 },
      },
      { type: "turn.started" },
      { type: "turn.completed" },
    ),
    metadata,
  )
  assert.equal(summary.usage.inputTokens, null)
  assert.equal(summary.usage.complete, false)
})
