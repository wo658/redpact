import assert from "node:assert/strict"
import { test } from "node:test"
import { assessCapabilities } from "./preflight.ts"

test("이전 런타임을 동등한 B/C 비교 가능 상태로 판정하지 않는다", () => {
  const result = assessCapabilities(["configure", "run_tests", "get_run"], ["/api/runs"])
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes("MCP run_playwright"))
  assert.ok(result.missing.includes("HTTP /api/workspace-status"))
})
test("승인 및 결과 조회를 포함한 실행 경로가 있으면 준비 상태다", () => {
  assert.equal(
    assessCapabilities(
      [
        "configure",
        "run_tests",
        "get_run",
        "run_playwright",
        "get_execution",
        "get_review_context",
        "get_workspace_status",
      ],
      ["/api/workspace-status", "/api/review-context", "/api/worktrees/{id}/playwright/run"],
    ).ready,
    true,
  )
})
