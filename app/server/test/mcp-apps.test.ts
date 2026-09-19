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
  return (await response.json()).result
}
test("MCP tools link two self-contained sandboxed Apps resources", async () => {
  const tools = await rpc("tools/list")
  expect(
    tools.tools.find((tool: { name: string }) => tool.name === "configure")._meta.ui.resourceUri,
  ).toBe("ui://redpact/environment.html")
  expect(
    tools.tools.find((tool: { name: string }) => tool.name === "get_run")._meta.ui.resourceUri,
  ).toBe("ui://redpact/tests.html")
  const resources = await rpc("resources/list")
  expect(resources.resources.map((resource: { uri: string }) => resource.uri).sort()).toEqual([
    "ui://redpact/environment.html",
    "ui://redpact/tests.html",
  ])
  for (const uri of resources.resources.map((resource: { uri: string }) => resource.uri)) {
    const { contents } = await rpc("resources/read", { uri })
    expect(contents[0].mimeType).toBe("text/html;profile=mcp-app")
    expect(contents[0].text).toContain("ui/initialize")
    expect(contents[0].text).not.toMatch(/<script[^>]+src=|<link[^>]+href=/)
    expect(contents[0]._meta.ui.csp.connectDomains).toEqual([])
    expect(contents[0].text).not.toContain("Order Desk")
  }
})
