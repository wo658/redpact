import { expect, test } from "vitest"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

test("MCP는 검증 도구를 확장하되 Git·파일 편집·독립 환경 관리 도구를 노출하지 않는다", async () => {
  const app = createApp({ settings: createSettingsService(process.cwd()) } as Services)
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      Host: "localhost",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })
  const { result } = await response.json()
  expect(result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
    "cancel_execution",
    "configure",
    "get_execution",
    "get_review_context",
    "get_run",
    "get_workspace_status",
    "list_executions",
    "run_playwright",
    "run_tests",
    "run_unit_tests",
  ])
  const run = result.tools.find((tool: { name: string }) => tool.name === "run_tests")
  expect(run.inputSchema.properties).toHaveProperty("path")
  expect(run.inputSchema.properties).not.toHaveProperty("submissionId")
  expect(run.description).toMatch(/managed Integration tests/)
  expect(run.description).toMatch(/never runs Unit commands or Playwright targets/)
})
