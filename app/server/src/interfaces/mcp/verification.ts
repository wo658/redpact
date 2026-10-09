import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { problem } from "../../core/problems.js"
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
import {
  executionReviewResult,
  executionSnapshot,
  reviewResult,
  testsResource,
  uiMeta,
} from "./apps.js"
import { invoke, output, readOnly } from "./result.js"

export function registerVerificationTools(server: McpServer, services: Services) {
  if (services.executionReviews) {
    const reviews = services.executionReviews
    server.registerTool(
      "execution_review_action",
      {
        description:
          "Approve the exact Unit or Playwright request shown in the Redpact App. UI capability required.",
        inputSchema: z.strictObject({
          id: z.string().uuid(),
          token: z.string().min(32),
          revision: z.number().int().nonnegative(),
        }),
        _meta: { ui: { resourceUri: testsResource, visibility: ["app"] } },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input) => {
        try {
          return executionReviewResult(await reviews.approve(input), reviews)
        } catch (error) {
          return invoke(() => {
            throw error
          })
        }
      },
    )
  }
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
        "Run the complete configured Unit command for an absolute existing checkout path, in its own temporary container. Records command output, input identity and cleanup; no per-file filter or host-command fallback. Does not create Git worktrees. Under Ask policy, returns a review card and waits for explicit human approval of the captured command and inputs. Read get_execution with kind=unit for progress and evidence.",
      inputSchema: unitExecutionInput,
      annotations: execution,
      _meta: uiMeta(testsResource),
    },
    async ({ path }) => {
      try {
        const value = await runUnitVerification(services, path)
        if ("review" in value) {
          return executionReviewResult(
            value,
            services.executionReviews ??
              problem("settings_unsupported", "Execution approval is unavailable"),
          )
        }
        return { ...output(value), _meta: { redpact: executionSnapshot(value.kind, value.run) } }
      } catch (error) {
        return invoke(() => {
          throw error
        })
      }
    },
  )
  server.registerTool(
    "run_playwright",
    {
      description:
        "Run one declared Playwright target for an absolute existing checkout path. Choose the exact target name from configure inspect; target purpose determines functional results or capture evidence. Uses the actual application in a temporary environment, preserving screenshots and source identity. Does not create Git worktrees or grant approval. Under Ask policy, returns a review card for explicit human approval of the captured target, viewport and inputs. Read get_execution with kind=playwright.",
      inputSchema: playwrightExecutionInput,
      annotations: execution,
      _meta: uiMeta(testsResource),
    },
    async (input) => {
      try {
        const value = await runPlaywrightVerification(services, input)
        if ("review" in value) {
          return executionReviewResult(
            value,
            services.executionReviews ??
              problem("settings_unsupported", "Execution approval is unavailable"),
          )
        }
        return { ...output(value), _meta: { redpact: executionSnapshot(value.kind, value.run) } }
      } catch (error) {
        return invoke(() => {
          throw error
        })
      }
    },
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
        "Read recorded verification evidence by kind and ID. detail=result returns progress, source identity, verdict and cleanup; log returns bounded recorded diagnostics; source with sourcePath reads captured Integration/Playwright test code, never the live file; image with artifactId returns a recorded Playwright PNG (at most 8 MiB). Video, trace and larger images remain in the viewer. Passing evidence is not current-code freshness or human acceptance. Review IDs are supported for result and return a refreshed approval card; recorded evidence requires an admitted execution.",
      inputSchema: executionReadInput,
      _meta: uiMeta(testsResource),
      annotations: readOnly,
    },
    async (input) => {
      try {
        const value = await readExecution(services, input)
        const review =
          input.detail === "result" ? services.executionReviews?.get(input.id) : undefined
        if (review && services.executionReviews) {
          return executionReviewResult(review, services.executionReviews)
        }
        const integration =
          input.kind === "integration" && input.detail === "result"
            ? services.reviews?.get(input.id)
            : undefined
        if (integration && services.reviews) {
          return { ...output(value), _meta: reviewResult(integration, services.reviews)._meta }
        }
        let redpact: object
        if (input.detail === "result" && "run" in value && value.run) {
          redpact =
            input.kind === "integration"
              ? {
                  kind: "tests",
                  run: value.run,
                  submission: services.submissions.get(
                    (value.run as { submissionId: string }).submissionId,
                  ),
                }
              : executionSnapshot(
                  input.kind,
                  value.run as
                    | import("../../core/types/unit-tests.js").UnitRun
                    | import("../../core/types/playwright.js").CaptureRun,
                )
        } else {
          let text: unknown
          if ("source" in value) {
            text = value.source
          }
          if ("text" in value) {
            text = value.text
          }
          redpact = {
            kind: "evidence",
            evidence: {
              kind: input.kind,
              id: input.id,
              detail: input.detail,
              text,
              sourcePath: input.sourcePath,
            },
          }
        }
        if ("image" in value && value.image) {
          const { image, ...metadata } = value
          return {
            ...output(metadata),
            _meta: { redpact },
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
        return { ...output(value), _meta: { redpact } }
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
        "Cancel only the identified Unit, Integration or Playwright execution, retaining its evidence. Existing execution workflows own cancellation and resource cleanup; this is not an arbitrary container or environment stop. Unit and Playwright also support their existing cleanup retry. A review ID cancels its pending request without approving it.",
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
