import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { expect, test } from "vitest"
import { createServer } from "../src/server.js"

test("사이드바 진입점에서 로컬 카운터를 변경하고 다시 읽을 수 있다", async () => {
  const server = createServer()
  const client = new Client({ name: "sidebar-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const { tools } = await client.listTools()
    const entry = tools.find((tool) => tool.name === "open_sidebar_lab")
    expect(entry?._meta).toMatchObject({
      ui: { resourceUri: "ui://sidebar-lab/main.html" },
      "openai/ui": { entrypoints: [{ type: "global" }] },
    })
    const initial = await client.callTool({ name: "get_lab_state", arguments: {} })
    expect(initial.structuredContent).toMatchObject({ count: 0 })
    await client.callTool({ name: "increment_lab", arguments: {} })
    const updated = await client.callTool({ name: "get_lab_state", arguments: {} })
    expect(updated.structuredContent).toMatchObject({ count: 1 })
    await client.callTool({ name: "reset_lab", arguments: {} })
    const reset = await client.callTool({ name: "get_lab_state", arguments: {} })
    expect(reset.structuredContent).toMatchObject({ count: 0 })
    const resource = await client.readResource({ uri: "ui://sidebar-lab/main.html" })
    expect(resource.contents[0].mimeType).toBe("text/html;profile=mcp-app")
  } finally {
    await client.close()
    await server.close()
  }
})
