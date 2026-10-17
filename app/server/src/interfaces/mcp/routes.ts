import { isAbsolute } from "node:path"
import { createMcpHonoApp } from "@modelcontextprotocol/hono"
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { publicSettings } from "../../core/settings.js"
import { configure, configureInput } from "../../workflows/configure.js"
import type { Services } from "../../workflows/services.js"
import { environmentResource, registerApps, uiMeta } from "./apps.js"
import { registerChatContextTools } from "./chat-context.js"
import { registerLifecycleTools } from "./lifecycle.js"
import { invoke, readOnly } from "./result.js"
import { registerVerificationTools } from "./verification.js"

const pathInput = z
  .string()
  .min(1)
  .max(4096)
  .refine(isAbsolute, "Use an absolute project directory")
export function mcpRoutes(services: Services) {
  return createMcpHonoApp().all("/", async (c) => {
    const server = new McpServer({ name: "redpact", version: "0.1.0" })
    registerLifecycleTools(server, services, new URL(c.req.url).origin)
    registerApps(server, services.reviews)
    registerVerificationTools(server, services)
    registerChatContextTools(server, services)
    server.registerTool(
      "configure",
      {
        description:
          "App-only configuration inspection. Agent settings access uses redpact settings describe/get/patch/validate with an explicit scope and checkout path; describe resolves the shared rulesRoot. Use action=inspect for current settings and discovered tests. All worktrees share one fixed project configuration; execution inputs resolve in the requested checkout. This read-only tool never saves files, starts containers or tests, or grants approval; validation does not prove readiness.",
        inputSchema: configureInput.extend({
          path: pathInput
            .optional()
            .describe(
              "The absolute execution checkout project directory; supply it even for describe to resolve rulesRoot. Compose and test paths resolve here, while shared settings belong to rulesRoot. Mutually exclusive with worktreeId.",
            ),
          worktreeId: z
            .string()
            .uuid()
            .optional()
            .describe(
              "An existing bound worktree ID instead of path. Prefer path when authoring configuration. Omission uses the startup default when available.",
            ),
        }),
        _meta: uiMeta(environmentResource),
        annotations: readOnly,
      },
      async (input) => {
        const result = await invoke(() => configure(services, input))
        const value = result.structuredContent
        const path = typeof value.projectRoot === "string" ? value.projectRoot : undefined
        const validation = value.validation as ReturnType<typeof publicSettings> | undefined
        const preview = {
          kind: "environment",
          path,

          dependencies: value.dependencies,
          valid: validation?.valid,
          issues: validation?.issues ?? [],
          policy: services.reviews?.policy() ?? "auto",
          nextPolicy: services.reviews?.policy() ?? "auto",
          token: services.reviews?.capability(),
        }

        return {
          ...result,
          _meta: { redpact: preview },
          isError:
            "isError" in result ||
            Boolean(
              value.validation &&
                typeof value.validation === "object" &&
                "valid" in value.validation &&
                !value.validation.valid,
            ),
        }
      },
    )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return await transport.handleRequest(c.req.raw)
    } finally {
      await server.close()
    }
  })
}
