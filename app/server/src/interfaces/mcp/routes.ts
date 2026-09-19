import { isAbsolute } from "node:path"
import { createMcpHonoApp } from "@modelcontextprotocol/hono"
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server"
import { z } from "zod"
import { problem } from "../../core/problems.js"
import { publicSettings } from "../../core/settings.js"
import { projectPath, testSelectionSchema } from "../../core/settings-schema.js"
import type { SettingsResult } from "../../core/types/settings.js"
import { configure, configureInput } from "../../workflows/configure.js"
import type { Services } from "../../workflows/services.js"
import { idInput } from "../schemas.js"
import { environmentResource, registerApps, reviewResult, testsResource, uiMeta } from "./apps.js"

const pathInput = z
  .string()
  .min(1)
  .max(4096)
  .refine(isAbsolute, "Use an absolute project directory")
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const output = (value: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
})
async function invoke(operation: () => unknown) {
  try {
    const value = await operation()
    return output(value as object)
  } catch (error) {
    return {
      ...output({
        error: error instanceof Error ? error.message : "Operation failed",
        ...(error instanceof Error && "code" in error ? { code: error.code } : {}),
        ...(error instanceof Error && "validation" in error
          ? { validation: publicSettings(error.validation as SettingsResult) }
          : {}),
      }),
      isError: true,
    }
  }
}
export function mcpRoutes(services: Services) {
  return createMcpHonoApp().all("/", async (c) => {
    const server = new McpServer({ name: "redpact", version: "0.1.0" })
    registerApps(server, services.reviews)
    if (services.projectSecrets) {
      const secrets = services.projectSecrets
      server.registerTool(
        "request_keys",
        {
          description:
            "Show an MCP input card for required external service credentials during setup. Supply only declared names actually needed by the requested external integration. Never send credential values through agent arguments. Returns availability only; the user enters values in the card.",
          inputSchema: z.strictObject({
            projectId: z.string().min(1),
            names: z.array(z.string().min(1)).min(1).max(100),
          }),
          _meta: uiMeta(environmentResource),
          annotations: { ...readOnly, readOnlyHint: false },
        },
        async ({ projectId, names }) => {
          try {
            const request = await secrets.request(projectId, names)
            return {
              ...output({ projectId, inputs: request.inputs }),
              _meta: { redpact: { kind: "inputs", projectId, ...request } },
            }
          } catch (error) {
            return invoke(() => {
              throw error
            })
          }
        },
      )
      server.registerTool(
        "submit_key",
        {
          description:
            "Save one credential from its scoped user input card. UI capability required.",
          inputSchema: z.strictObject({
            token: z.string().min(32),
            name: z.string().min(1),
            value: z.string().max(10000),
          }),
          _meta: { ui: { resourceUri: environmentResource, visibility: ["app"] } },
          annotations: { ...readOnly, readOnlyHint: false },
        },
        ({ token, name, value }) => invoke(() => secrets.submit(token, name, value)),
      )
    }
    server.registerTool(
      "configure",
      {
        description:
          "Configure Redpact through local files: first call action=describe with the absolute checkout path for the current schema, examples and rulesRoot. Inspect existing files, edit rulesRoot/.redpact/settings.json directly, then call action=validate with path and optional selection. Use action=inspect for current settings and discovered tests. Linked worktrees may author scoped dependencies.override.json as described by specification.dependencyOverrides; inspect returns a read-only promotion candidate. Shared settings and checkout-local execution choices are separate. This read-only tool never saves files, starts containers or tests, or grants approval; validation does not prove readiness.",
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
          selection: input.selection,
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
    server.registerTool(
      "run_tests",
      {
        description:
          "Run managed Integration tests from tests.directory in the project at path. This MCP tool never runs Unit commands or Playwright targets; use the Redpact viewer or HTTP execution routes for those separate runtimes. Snapshots Integration sources and returns a run ID while the server prepares the selected Compose environment and executes Vitest. Omit selection to use saved worktree choices; supply selection for the first run or to replace them. Temporary environments are removed after execution, with logs and results preserved. No registration or submission calls are required.",
        _meta: uiMeta(testsResource),
        inputSchema: z.strictObject({
          path: pathInput,
          tests: z.array(projectPath).min(1).max(50).optional(),
          selection: testSelectionSchema.optional(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input) => {
        if (services.reviews) {
          try {
            return reviewResult(await services.reviews.start(input), services.reviews)
          } catch (error) {
            return invoke(() => {
              throw error
            })
          }
        }
        return invoke(() =>
          (services.runFiles ?? problem("settings_unsupported", "File execution is unavailable"))(
            input,
          ),
        )
      },
    )
    server.registerTool(
      "get_run",
      {
        description:
          "Read run state, results and environment cleanup status. A queued run may still be preparing its environment. Results preserve executed source identity and do not establish code freshness or approval.",
        inputSchema: idInput,
        _meta: uiMeta(testsResource),
        annotations: readOnly,
      },
      ({ id }) => {
        const review = services.reviews?.get(id)
        if (review && services.reviews) {
          return reviewResult(
            review,
            services.reviews,
            review.review.state === "pending" ? "review" : "tests",
          )
        }
        const run = services.runs.get(id)
        return {
          ...output(run),
          _meta: {
            redpact: { kind: "tests", run, submission: services.submissions.get(run.submissionId) },
          },
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
