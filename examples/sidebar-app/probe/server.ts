import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

declare const PROBE_HTML: string
declare const PROBE_URI: string
const server = new McpServer({ name: "test-plan-probe", version: "0.0.1" })
server.registerResource(
  "test-plan-probe",
  PROBE_URI,
  { mimeType: "text/html;profile=mcp-app" },
  async () => ({
    contents: [
      {
        uri: PROBE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: PROBE_HTML,
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      },
    ],
  }),
)
server.registerTool(
  "open_test_plan_probe",
  {
    description:
      "Open the local natural-language test-plan editing probe. This only verifies chat submission; it never executes tests or grants execution approval.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: PROBE_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: "Edit the Unit, Integration and Playwright plans in the probe, then submit to this chat. Confirm receipt by repeating the probe marker and revised text. Do not execute these sample plans.",
      },
    ],
  }),
)
await server.connect(new StdioServerTransport())
