import { type APIRequestContext, expect, type Page } from "@playwright/test"

export async function openMcpEnvironment(page: Page, request: APIRequestContext) {
  const connected = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(connected.ok()).toBeTruthy()
  const project = await connected.json()
  const endpoint = `/api/projects/${project.id}/configuration`
  const original = await (await request.get(endpoint)).json()
  const configured = await request.put(endpoint, {
    data: {
      revision: original.revision,
      source: JSON.stringify({
        ...JSON.parse(original.source),
        dependencies: {
          payment: { kind: "remote", env: { app: { PAYMENT_URL: "https://payment.test" } } },
          search: { kind: "shared-local", env: { app: { SEARCH_URL: "http://search.test" } } },
        },
        relationships: [],
      }),
    },
  })
  expect(configured.ok()).toBeTruthy()
  let session: string | undefined
  let id = 0
  async function rpc(method: string, params: unknown) {
    const response = await request.post("/mcp", {
      headers: {
        Accept: "application/json, text/event-stream",
        ...(session ? { "mcp-session-id": session } : {}),
      },
      data: { jsonrpc: "2.0", id: ++id, method, params },
    })
    expect(response.ok()).toBeTruthy()
    session = response.headers()["mcp-session-id"] ?? session
    const text = await response.text()
    const value =
      text.startsWith("event:") || text.startsWith("data:")
        ? text
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => JSON.parse(line.slice(5)))
            .at(-1)
        : JSON.parse(text)
    expect(value.error).toBeUndefined()
    return value.result
  }
  async function restore() {
    const latest = await (await request.get(endpoint)).json()
    expect(
      (
        await request.put(endpoint, {
          data: { source: original.source, revision: latest.revision },
        })
      ).ok(),
    ).toBeTruthy()
    if (session) {
      await request.delete("/mcp", { headers: { "mcp-session-id": session } })
    }
  }
  try {
    await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Redpact browser test", version: "1" },
    })
    const resource = await rpc("resources/read", { uri: "ui://redpact/environment.html" })
    const result = await rpc("tools/call", {
      name: "configure",
      arguments: { action: "inspect", path: "/app" },
    })
    expect(result.isError).not.toBe(true)
    await page.goto("/")
    // 실제 서버의 App 리소스를 테스트 호스트 브리지로 열어 snapshot을 전달한다.
    await page.evaluate((snapshot) => {
      window.addEventListener("message", (event) => {
        const message = event.data
        if (message?.method === "ui/initialize") {
          window.postMessage(
            {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: message.params.protocolVersion,
                hostInfo: { name: "Redpact browser test host", version: "1" },
                hostCapabilities: {},
                hostContext: { theme: "light" },
              },
            },
            "*",
          )
        }
        if (message?.method === "ui/notifications/initialized") {
          window.postMessage(
            { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: snapshot },
            "*",
          )
        }
      })
    }, result)
    await page.setContent(resource.contents[0].text)
    await expect(page.getByLabel("Environment", { exact: true })).toBeVisible()
    return restore
  } catch (error) {
    await restore()
    throw error
  }
}
