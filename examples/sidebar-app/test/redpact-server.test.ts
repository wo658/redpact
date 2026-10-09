import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { expect, test, vi } from "vitest"
import { createAppServer, pageUri } from "../src/redpact/server.js"

test("활성화 이후 앱 조회는 서버를 재시작하지 않고 수동 시작은 앱 전용 권한을 검사한다", async () => {
  const status = {
    state: "stopped" as const,
    owned: false,
    origin: "http://127.0.0.1:54321",
    dataDir: "/example",
    logPath: "/example/log",
    message: "Stopped",
  }
  const runtime = {
    status: vi.fn(async () => status),
    activate: vi.fn(async () => status),
    start: vi.fn(async () => status),
    stop: vi.fn(async () => status),
    install: vi.fn(async () => status),
    request: vi.fn(async () => undefined),
  }
  const bridge = {
    request: vi.fn(async () => ({ status: 200, contentType: "application/json", body: "e30=" })),
    events: vi.fn(),
    close: vi.fn(),
  }
  const server = createAppServer({
    bridge,
    runtime,
    html: "<h1>Redpact</h1>",
    token: "test-capability",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
  })
  const client = new Client({ name: "redpact-app-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).not.toContain("connect_redpact_project")
    expect(tools.map((tool) => tool.name)).not.toContain("get_redpact_evidence")
    expect(tools.find((tool) => tool.name === "redpact_viewer_request")?._meta).toMatchObject({
      ui: { visibility: ["app"] },
    })
    expect(tools.find((tool) => tool.name === "open_redpact_app")?._meta).toMatchObject({
      ui: { resourceUri: pageUri },
      "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
    })
    expect(tools.find((tool) => tool.name === "start_redpact_server")?._meta).toMatchObject({
      ui: { visibility: ["app"] },
    })
    expect(tools.find((tool) => tool.name === "open_redpact_app")?.icons?.[0].src).toBe(
      "data:image/svg+xml;base64,PHN2Zy8+",
    )
    const deniedApi = await client.callTool({
      name: "redpact_viewer_request",
      arguments: { token: "wrong", path: "/api/projects", method: "GET" },
    })
    expect(deniedApi.isError).toBe(true)
    expect(bridge.request).not.toHaveBeenCalled()
    const apiResult = await client.callTool({
      name: "redpact_viewer_request",
      arguments: { token: "test-capability", path: "/api/projects", method: "GET" },
    })
    expect(apiResult.content).toEqual([])
    expect(apiResult._meta?.response).toMatchObject({ status: 200, body: "e30=" })
    status.state = "running" as typeof status.state
    const opened = await client.callTool({ name: "open_redpact_app", arguments: {} })
    expect(runtime.start).not.toHaveBeenCalled()
    expect(opened._meta?.viewerUrl).toBeUndefined()
    expect(JSON.stringify(opened.content)).not.toContain("test-capability")
    expect(opened._meta).toMatchObject({
      controlToken: "test-capability",
      page: { status: { state: "running" } },
    })
    const review = await client.callTool({
      name: "open_redpact_app",
      arguments: { kind: "unit", id: "8c9a6d6b-30f8-4e31-a476-5a494d449bdc" },
    })
    expect(review._meta?.reviewPath).toBe(
      "/?page=review&kind=unit&id=8c9a6d6b-30f8-4e31-a476-5a494d449bdc",
    )
    expect(JSON.stringify(review.content)).not.toContain("test-capability")
    const incomplete = await client.callTool({
      name: "open_redpact_app",
      arguments: { kind: "unit" },
    })
    expect(incomplete.isError).toBe(true)
    expect(runtime.request).not.toHaveBeenCalled()
    expect(opened._meta?.page).not.toHaveProperty("projects")
    const denied = await client.callTool({
      name: "start_redpact_server",
      arguments: { token: "wrong" },
    })
    expect(denied.isError).toBe(true)
    expect(runtime.start).not.toHaveBeenCalled()
    await client.callTool({ name: "start_redpact_server", arguments: { token: "test-capability" } })
    expect(runtime.start).toHaveBeenCalledTimes(1)
    const resource = await client.readResource({ uri: pageUri })
    expect(resource.contents[0].mimeType).toBe("text/html;profile=mcp-app")
    expect(resource.contents[0]._meta).toMatchObject({
      ui: {
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
      },
    })
  } finally {
    await client.close()
    await server.close()
  }
})
