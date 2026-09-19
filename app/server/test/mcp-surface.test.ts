import { expect, test } from "vitest"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

test("MCP exposes only configuration, submission and result tools, without registration or submission prerequisites", async () => {
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
    "configure",
    "get_run",
    "run_tests",
  ])
  const run = result.tools.find((tool: { name: string }) => tool.name === "run_tests")
  expect(run.inputSchema.properties).toHaveProperty("path")
  expect(run.inputSchema.properties).not.toHaveProperty("submissionId")
  expect(run.description).toMatch(/managed Integration tests/)
  expect(run.description).toMatch(/never runs Unit commands or Playwright targets/)
})
