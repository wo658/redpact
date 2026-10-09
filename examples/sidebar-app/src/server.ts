import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export const resourceUri = "ui://sidebar-lab/main.html"

export function createServer(html = "<!doctype html><title>Sidebar Lab</title>") {
  const server = new McpServer({ name: "sidebar-lab", version: "0.1.0" })
  let count = 0
  const startedAt = new Date().toISOString()
  const snapshot = () => ({
    content: [{ type: "text" as const, text: `Local counter: ${count}` }],
    structuredContent: { count, pid: process.pid, startedAt, transport: "stdio" },
  })
  server.registerResource(
    "sidebar-lab",
    resourceUri,
    {
      mimeType: "text/html;profile=mcp-app",
    },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
        },
      ],
    }),
  )
  server.registerTool(
    "open_sidebar_lab",
    {
      title: "Sidebar Lab",
      description: "Open the local Sidebar Lab to test the sidebar entrypoint and MCP controls.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri },
        "openai/ui": { entrypoints: [{ type: "global" }] },
      },
    },
    async () => snapshot(),
  )
  for (const name of ["get_lab_state", "increment_lab", "reset_lab"] as const) {
    server.registerTool(
      name,
      {
        description: `${name}: operate on this example process's in-memory counter only.`,
        inputSchema: {},
        annotations: {
          readOnlyHint: name === "get_lab_state",
          destructiveHint: false,
          idempotentHint: name !== "increment_lab",
          openWorldHint: false,
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      async () => {
        if (name === "increment_lab") {
          count += 1
        }
        if (name === "reset_lab") {
          count = 0
        }
        return snapshot()
      },
    )
  }
  return server
}
