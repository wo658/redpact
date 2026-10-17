import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { expect, test, vi } from "vitest"
import { createAppServer } from "../src/redpact/server.js"

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
    const ui = tools.find((tool) => tool.name === "open_redpact_app")?._meta?.ui as
      | { resourceUri: string }
      | undefined
    if (!ui) {
      throw new Error("App resource metadata is missing")
    }
    const pageUri = ui.resourceUri
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

test("화면 내용이 바뀌면 호스트가 새 리소스를 읽고 이전 화면 주소를 재사용하지 않는다", async () => {
  async function resource(html: string) {
    const runtime = { status: vi.fn() } as unknown as Parameters<
      typeof createAppServer
    >[0]["runtime"]
    const server = createAppServer({ runtime, html, token: "test-capability" })
    const client = new Client({ name: "resource-update-test", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const { tools } = await client.listTools()
      const ui = tools.find((tool) => tool.name === "open_redpact_app")?._meta?.ui as {
        resourceUri: string
      }
      const result = await client.readResource({ uri: ui.resourceUri })
      expect(result.contents[0]).toMatchObject({ text: html })
      return ui.resourceUri
    } finally {
      await client.close()
      await server.close()
    }
  }
  const previous = await resource("<h1>Execution review</h1>")
  const restored = await resource("<h1>Project workspace</h1>")
  expect(restored).not.toBe(previous)
  expect(await resource("<h1>Project workspace</h1>")).toBe(restored)
})

test("모델은 런타임 상태·시작·종료만 호출하고 앱 권한과 내부 경로는 받지 않는다", async () => {
  const status = {
    state: "stopped" as const,
    owned: false,
    origin: "http://127.0.0.1:54322",
    dataDir: "/private/runtime",
    logPath: "/private/runtime/log",
    message: "Stopped",
    startedPid: 123,
  }
  const runtime = {
    status: vi.fn(async () => status),
    start: vi.fn(async () => ({ ...status, state: "running" as const, owned: true })),
    stop: vi.fn(async () => status),
    install: vi.fn(async () => status),
    request: vi.fn(async () => undefined),
  }
  const server = createAppServer({
    runtime,
    html: "<h1>Redpact</h1>",
    token: "private-control-token",
  })
  const client = new Client({ name: "lifecycle-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const { tools } = await client.listTools()
    const names = ["get_redpact_status", "start_redpact_runtime", "stop_redpact_runtime"]
    expect(tools.filter((tool) => names.includes(tool.name)).map((tool) => tool.name)).toEqual(
      names,
    )
    for (const name of names) {
      const tool = tools.find((tool) => tool.name === name)
      expect(tool?.inputSchema.properties).toEqual({})
      const result = await client.callTool({ name, arguments: {} })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toEqual({
        state: name === "start_redpact_runtime" ? "running" : "stopped",
        owned: name === "start_redpact_runtime",
        origin: status.origin,
        message: status.message,
      })
      expect(JSON.stringify(result)).not.toContain("private-control-token")
      expect(JSON.stringify(result)).not.toContain("/private/runtime")
      expect(result._meta).toBeUndefined()
    }
    expect(runtime.start).toHaveBeenCalledTimes(1)
    expect(runtime.stop).toHaveBeenCalledTimes(1)
    expect(runtime.install).not.toHaveBeenCalled()
    expect(runtime.request).not.toHaveBeenCalled()
    runtime.stop.mockRejectedValueOnce(
      new Error("Internal /private/runtime contains private-control-token"),
    )
    const failure = await client.callTool({ name: "stop_redpact_runtime", arguments: {} })
    expect(failure.isError).toBe(true)
    expect(JSON.stringify(failure)).not.toContain("/private/runtime")
    expect(JSON.stringify(failure)).not.toContain("private-control-token")

    expect(tools.find((tool) => tool.name === "start_redpact_server")?._meta).toMatchObject({
      ui: { visibility: ["app"] },
    })
  } finally {
    await client.close()
    await server.close()
  }
})
