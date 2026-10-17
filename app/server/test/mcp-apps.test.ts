import { expect, test } from "vitest"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

const app = createApp({ settings: createSettingsService(process.cwd()) } as Services)
async function rpc(method: string, params?: object) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      Host: "localhost",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  return response.json()
}
test("런타임 MCP는 채팅 카드와 승인 도구를 노출하지 않는다", async () => {
  const { result } = await rpc("tools/list")
  expect(result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
    "configure",
    "get_review_context",
    "get_run",
    "get_run_artifact",
    "get_workspace_status",
    "list_runs",
    "project_container",
    "run_tests",
  ])
  for (const tool of result.tools) {
    expect(tool._meta?.ui).toBeUndefined()
  }
  const resources = await rpc("resources/list")
  expect(resources.result?.resources ?? []).toEqual([])
  const removed = await rpc("resources/read", { uri: "ui://redpact/tests.html" })
  expect(removed.error).toBeDefined()
})
