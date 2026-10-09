import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import {
  executionIdentity,
  executionReadInput,
  playwrightExecutionInput,
  unitExecutionInput,
  verificationPath,
} from "../../core/verification-schema.js"
import type { Services } from "../../workflows/services.js"
import {
  cancelExecution,
  listExecutions,
  readExecution,
  runPlaywrightVerification,
  runUnitVerification,
} from "../../workflows/verification.js"
import { invoke, output, readOnly } from "./result.js"

export function registerVerificationTools(server: McpServer, services: Services) {
  const execution = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  }
  server.registerTool(
    "run_unit_tests",
    {
      description:
        "Run the complete configured Unit command for an absolute existing checkout path, in its own temporary container. Records command output, input identity and cleanup; no per-file filter or host-command fallback. Does not create Git worktrees. Under Ask policy, use an explicit viewer action; this tool cannot grant approval. Read get_execution with kind=unit for progress and evidence.",
      inputSchema: unitExecutionInput,
      annotations: execution,
    },
    ({ path }) =>
      invoke(async () => ({ kind: "unit", run: await runUnitVerification(services, path) })),
  )
  server.registerTool(
    "run_playwright",
    {
      description:
        "Run one declared Playwright target for an absolute existing checkout path. Choose the exact target name from configure inspect; target purpose determines functional results or capture evidence. Uses the actual application in a temporary environment, preserving screenshots and source identity. Does not create Git worktrees or grant approval. Under Ask policy, use the viewer. Read get_execution with kind=playwright.",
      inputSchema: playwrightExecutionInput,
      annotations: execution,
    },
    (input) =>
      invoke(async () => ({
        kind: "playwright",
        run: await runPlaywrightVerification(services, input),
      })),
  )
  server.registerTool(
    "list_executions",
    {
      description:
        "Read retained Unit, Integration and Playwright execution history for an absolute checkout path, newest first, with the returned cursor for pagination. Does not connect a project, create a checkout, start containers or run tests. An unobserved checkout has no recorded history.",
      inputSchema: z.strictObject({
        path: verificationPath,
        before: z.string().min(1).max(4096).optional(),
      }),
      annotations: readOnly,
    },
    ({ path, before }) => invoke(() => listExecutions(services, path, before)),
  )
  server.registerTool(
    "get_execution",
    {
      description:
        "Read recorded verification evidence by kind and ID. detail=result returns progress, source identity, verdict and cleanup; log returns bounded recorded diagnostics; source with sourcePath reads captured Integration/Playwright test code, never the live file; image with artifactId returns a recorded Playwright PNG (at most 8 MiB). Video, trace and larger images remain in the viewer. Passing evidence is not current-code freshness or human acceptance. Integration review IDs are supported for result; use the eventual run ID for log/source.",
      inputSchema: executionReadInput,
      annotations: readOnly,
    },
    async (input) => {
      try {
        const value = await readExecution(services, input)
        if ("image" in value && value.image) {
          const { image, ...metadata } = value
          return {
            ...output(metadata),
            content: [
              ...output(metadata).content,
              {
                type: "image" as const,
                mimeType: "image/png",
                data: Buffer.from(image).toString("base64"),
              },
            ],
          }
        }
        return output(value)
      } catch (error) {
        return invoke(() => {
          throw error
        })
      }
    },
  )
  server.registerTool(
    "cancel_execution",
    {
      description:
        "Cancel only the identified Unit, Integration or Playwright execution, retaining its evidence. Existing execution workflows own cancellation and resource cleanup; this is not an arbitrary container or environment stop. Unit and Playwright also support their existing cleanup retry. An Integration review ID cancels the pending review without approving it.",
      inputSchema: executionIdentity,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ kind, id }) => invoke(() => cancelExecution(services, kind, id)),
  )
}
