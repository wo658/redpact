import assert from "node:assert/strict"
import { test } from "node:test"
import { assessCapabilities } from "./preflight.ts"

test("이전 런타임을 동등한 B/C 비교 가능 상태로 판정하지 않는다", () => {
  const result = assessCapabilities(["configure", "run_tests", "get_run"], ["/api/runs"])
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes("HTTP /api/workspace-status"))
})
test("승인 및 결과 조회를 포함한 실행 경로가 있으면 준비 상태다", () => {
  assert.equal(
    assessCapabilities(
      ["configure", "run_tests", "get_run", "get_review_context", "get_workspace_status"],
      ["/api/workspace-status", "/api/review-context", "/api/worktrees/{id}/playwright/run"],
    ).ready,
    true,
  )
})

test("조회 전용 MCP에서는 과거 C 조건을 CLI로 대체하지 않고 차단 사유를 알린다", () => {
  const result = assessCapabilities(["configure", "get_run"], [])
  assert.equal(result.ready, false)
  assert.match(result.guidance, /historical.*C.*CLI/i)
})
