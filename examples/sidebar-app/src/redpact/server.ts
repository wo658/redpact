import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  type Icon,
  ListToolsRequestSchema,
  type Tool,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import type { createBridge } from "./bridge.js"
import type { localRuntime } from "./local.js"
import { readPage } from "./page.js"

export const pageUri = "ui://redpact-app/0.5.1/page.html"
export function createAppServer(options: {
  runtime: ReturnType<typeof localRuntime>
  html: string
  token: string
  bridge?: ReturnType<typeof createBridge>
  icon?: string
}) {
  const icons = options.icon
    ? [{ src: options.icon, mimeType: "image/svg+xml", sizes: ["any"] }]
    : undefined
  const server = new McpServer({ name: "redpact-app", version: "0.5.1", icons })
  const tools: Tool[] = []
  function registerTool<T extends z.ZodRawShape>(
    name: string,
    config: {
      title?: string
      description: string
      inputSchema: T
      annotations?: ToolAnnotations
      _meta: Record<string, unknown>
      icons?: Icon[]
    },
    handler: ToolCallback<T>,
  ) {
    server.registerTool(name, config, handler)
    // SDK 1.29's high-level tool registration drops standard MCP icons.
    tools.push({
      ...config,
      name,
      inputSchema: z.toJSONSchema(z.object(config.inputSchema)) as Tool["inputSchema"],
    })
  }
  const selection = {
    projectId: z.string().uuid().optional(),
    worktreeId: z.string().uuid().optional(),
  }
  async function snapshot(selected: { projectId?: string; worktreeId?: string } = {}) {
    const page = await readPage(options.runtime, selected)
    return {
      content: [
        {
          type: "text" as const,
          text: `Redpact: ${page.status.state}. ${page.runs.length} recent executions loaded.`,
        },
      ],
      _meta: {
        page,
        controlToken: options.token,
      },
    }
  }
  function authorize(token: string) {
    if (token !== options.token) {
      throw new Error("This action requires the App Page's control capability.")
    }
  }
  server.registerResource(
    "redpact-app-page",
    pageUri,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: pageUri,
          mimeType: "text/html;profile=mcp-app",
          text: options.html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
            "openai/ui": { availableDisplayModes: ["fullscreen"] },
          },
        },
      ],
    }),
  )
  registerTool(
    "redpact_viewer_request",
    {
      description: "Execute an authenticated App-only request against the fixed local Redpact API.",
      inputSchema: {
        token: z.string(),
        path: z.string().max(8192),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        body: z
          .string()
          .max(1024 * 1024)
          .optional(),
      },
      _meta: { ui: { visibility: ["app"] } },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ token, path, method, body }) => {
      authorize(token)
      if (!options.bridge) {
        throw new Error("Viewer bridge unavailable")
      }
      return { content: [], _meta: { response: await options.bridge.request(path, method, body) } }
    },
  )
  registerTool(
    "redpact_viewer_events",
    {
      description: "Read or close an authenticated App-only scoped runtime event subscription.",
      inputSchema: {
        token: z.string(),
        id: z.string().uuid(),
        path: z.string().max(8192),
        close: z.boolean().optional(),
      },
      _meta: { ui: { visibility: ["app"] } },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ token, id, path, close }) => {
      authorize(token)
      if (!options.bridge) {
        throw new Error("Viewer bridge unavailable")
      }
      return { content: [], _meta: { events: options.bridge.events(id, path, close) } }
    },
  )
  registerTool(
    "open_redpact_app",
    {
      title: "Redpact",
      icons,
      description:
        "Open the Redpact local App Page to start its server and inspect review evidence. Opening does not start the server or run tests.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: pageUri },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    () => snapshot(),
  )
  registerTool(
    "get_redpact_page",
    {
      inputSchema: selection,
      description: "Read the local App Page.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    snapshot,
  )
  registerTool(
    "install_redpact_runtime",
    {
      inputSchema: { token: z.string(), manager: z.enum(["npm", "pnpm"]) },
      description:
        "Install the pinned Redpact npm package in the plugin-managed directory after explicit user action. Poll the App Page for progress.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ token, manager }) => {
      authorize(token)
      await options.runtime.install(manager)
      return snapshot()
    },
  )
  registerTool(
    "start_redpact_server",
    {
      inputSchema: { token: z.string() },
      description: "Start the configured local Redpact server after an explicit App Page action.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ token }) => {
      authorize(token)
      await options.runtime.start()
      return snapshot()
    },
  )
  registerTool(
    "stop_redpact_server",
    {
      inputSchema: { token: z.string() },
      description:
        "Gracefully stop the server owned by this plugin session after an explicit App Page action.",
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ token }) => {
      authorize(token)
      await options.runtime.stop()
      return snapshot()
    },
  )
  registerTool(
    "connect_redpact_project",
    {
      inputSchema: { token: z.string(), path: z.string().min(1) },
      description: "Connect the explicitly selected local project without running tests.",
      _meta: { ui: { visibility: ["app"] } },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ token, path }) => {
      authorize(token)
      const result = z
        .object({ id: z.string() })
        .parse(await options.runtime.request("/api/projects", { path }))
      return snapshot({ projectId: result.id })
    },
  )
  registerTool(
    "get_redpact_evidence",
    {
      inputSchema: { id: z.string().uuid(), kind: z.enum(["integration", "unit", "playwright"]) },
      description: "Read the selected execution's recorded evidence for the App Page.",
      annotations: { readOnlyHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ id, kind }) => {
      const evidence = z
        .object({ text: z.string() })
        .parse(await options.runtime.request(`/api/runs/executions/${kind}/${id}/copy`))
      return {
        content: [{ type: "text", text: "Selected execution evidence loaded." }],
        _meta: { evidence: evidence.text },
      }
    },
  )
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
  return server
}
