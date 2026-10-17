import { createHash } from "node:crypto"
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

export function createAppServer(options: {
  runtime: ReturnType<typeof localRuntime>
  html: string
  token: string
  bridge?: ReturnType<typeof createBridge>
  icon?: string
}) {
  // Hosts cache App resources by URI across plugin updates.
  const digest = createHash("sha256").update(options.html).digest("hex")
  const pageUri = `ui://redpact-app/${digest}/page.html`
  const icons = options.icon
    ? [{ src: options.icon, mimeType: "image/svg+xml", sizes: ["any"] }]
    : undefined
  const server = new McpServer({ name: "redpact-app", version: "0.5.4", icons })
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
  async function snapshot() {
    const page = await readPage(options.runtime)
    return {
      content: [
        {
          type: "text" as const,
          text: `Redpact: ${page.status.state}.`,
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
  for (const operation of ["status", "start", "stop"] as const) {
    const names = {
      status: "get_redpact_status",
      start: "start_redpact_runtime",
      stop: "stop_redpact_runtime",
    }
    const descriptions = {
      status:
        "Read the configured Redpact runtime status without starting it. Use the Redpact CLI for projects, settings, execution and evidence.",
      start:
        "Start the installed, configured Redpact runtime owned by this plugin. Does not install packages, run tests or grant approval.",
      stop: "Gracefully stop only the Redpact runtime owned by this plugin session. A server owned by another session cannot be stopped.",
    }
    registerTool(
      names[operation],
      {
        description: descriptions[operation],
        inputSchema: {},
        annotations: {
          readOnlyHint: operation === "status",
          destructiveHint: operation === "stop",
          openWorldHint: false,
          idempotentHint: true,
        },
        _meta: {},
      },
      async () => {
        try {
          const status = await options.runtime[operation]()
          const result = {
            state: status.state,
            origin: status.origin,
            message: status.message,
            owned: status.owned,
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          }
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Unable to ${operation} the configured Redpact runtime. Open the Redpact App to inspect lifecycle diagnostics. No ownership restrictions were bypassed.`,
              },
            ],
          }
        }
      },
    )
  }
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
        "Open an exact recorded execution in the Redpact App Page with kind and id, or open the full project workspace without a selection. Opening does not run tests or approve requests.",
      inputSchema: {
        kind: z.enum(["unit", "integration", "playwright"]).optional(),
        id: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: pageUri },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async ({ kind, id }) => {
      if (Boolean(kind) !== Boolean(id)) {
        throw new Error("Provide both execution kind and id, or neither.")
      }
      const result = await snapshot()
      return {
        ...result,
        _meta: {
          ...result._meta,
          ...(kind && id ? { reviewPath: `/?page=review&kind=${kind}&id=${id}` } : {}),
        },
      }
    },
  )
  registerTool(
    "get_redpact_page",
    {
      inputSchema: {},
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
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
  return server
}
