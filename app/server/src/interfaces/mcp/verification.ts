import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { problem } from "../../core/problems.js"
import {
  artifactInput,
  getRunInput,
  runTestsInput,
  verificationPath,
} from "../../core/verification-schema.js"
import { getRunSummary } from "../../workflows/run-summary.js"
import type { Services } from "../../workflows/services.js"
import {
  listExecutions,
  projectContainer,
  readExecution,
  readRunArtifact,
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
    "run_tests",
    {
      description:
        "Run managed Integration, Unit or Playwright verification from an absolute existing checkout. kind defaults to integration for legacy calls. Integration accepts tests; executionScope overrides the shared all/changed default; Unit changed requires fileCommand; Playwright requires a declared target and optional viewport. Ask policy retains each kind's captured-input approval gates. No arbitrary command or per-case selection.",
      inputSchema: runTestsInput,
      annotations: execution,
      _meta: uiMeta(testsResource),
    },
    async (input) => {
      try {
        if (input.kind === "integration") {
          const request = {
            path: input.path,
            tests: input.tests,
            executionScope: input.executionScope,
          }
          if (services.reviews) {
            return reviewResult(await services.reviews.start(request), services.reviews)
          }
          return output(
            await (
              services.runFiles ?? problem("settings_unsupported", "File execution is unavailable")
            )(request),
          )
        }
        const value =
          input.kind === "unit"
            ? await runUnitVerification(services, input.path, input.executionScope)
            : await runPlaywrightVerification(services, input)
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
    "list_runs",
    {
      description:
        "Read retained Unit, Integration and Playwright execution history for an absolute checkout path, newest first, with the returned cursor for pagination. Does not connect a project, create a checkout, start containers or run tests. An unobserved checkout has no recorded history.",
      inputSchema: z.strictObject({
        path: verificationPath,
        before: z.string().min(1).max(4096).optional(),
        kind: z.enum(["integration", "unit", "playwright"]).optional(),
      }),
      annotations: readOnly,
    },
    ({ path, before, kind }) => invoke(() => listExecutions(services, path, before, kind)),
  )
  server.registerTool(
    "get_run",
    {
      description:
        "Read recorded verification evidence by kind and ID. Explicit kind with detail=result returns a bounded summary (20 failures/artifacts with counts and truncation), captured identity, verdict, cleanup and detail/viewer references; id-only calls retain the legacy Integration response; log returns bounded recorded diagnostics; source with sourcePath reads captured Integration/Playwright test code, never the live file; image with artifactId returns a recorded Playwright PNG (at most 8 MiB). Video, trace and larger images remain in the viewer. Passing evidence is not current-code freshness or human acceptance. Review IDs are supported for result and return a refreshed approval card; recorded evidence requires an admitted execution.",
      inputSchema: getRunInput,
      _meta: uiMeta(testsResource),
      annotations: readOnly,
    },
    async (input) => {
      try {
        if (!("kind" in input)) {
          const review = services.reviews?.get(input.id)
          if (review && services.reviews) {
            return reviewResult(
              review,
              services.reviews,
              review.review.state === "pending" ? "review" : "tests",
            )
          }
          const run = services.runs.get(input.id)
          return {
            ...output(run),
            _meta: {
              redpact: {
                kind: "tests",
                run,
                submission: services.submissions.get(run.submissionId),
              },
            },
          }
        }
        if (input.detail === "result") {
          const summary = getRunSummary(services, input)
          const executionReview = services.executionReviews?.get(input.id)
          if (!summary.executionId && executionReview && services.executionReviews) {
            return {
              ...executionReviewResult(executionReview, services.executionReviews),
              ...output(summary),
            }
          }
          const integrationReview =
            input.kind === "integration" ? services.reviews?.get(input.id) : undefined
          if (!summary.executionId && integrationReview && services.reviews) {
            return { ...reviewResult(integrationReview, services.reviews), ...output(summary) }
          }
          if (input.kind === "integration") {
            return {
              ...output(summary),
              _meta: {
                redpact: {
                  kind: "evidence",
                  evidence: {
                    kind: input.kind,
                    id: input.id,
                    detail: "result",
                    text: JSON.stringify(summary),
                  },
                },
              },
            }
          }
          const redpact = {
            kind: "execution",
            execution: {
              kind: input.kind,
              id: summary.executionId,
              path: summary.path,
              state: summary.state,
              outcome: summary.outcome,
              error: summary.failures[0]?.message,
              cleanup: summary.cleanup.state,
              ...summary.identity,
            },
          }
          return { ...output(summary), _meta: { redpact } }
        }
        const value = await readExecution(services, input)
        let text: unknown
        if ("source" in value) {
          text = value.source
        }
        if ("text" in value) {
          text = value.text
        }
        const redpact = {
          kind: "evidence",
          evidence: {
            kind: input.kind,
            id: input.id,
            detail: input.detail,
            text,
            sourcePath: input.sourcePath,
          },
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
    "get_run_artifact",
    {
      description:
        "Read one recorded Playwright screenshot, video or trace owned by the named run and side, up to 8 MiB. Larger artifacts remain in the viewer. Artifact IDs from other executions are rejected.",
      inputSchema: artifactInput,
      annotations: readOnly,
    },
    async (input) => {
      try {
        const { data, ...metadata } = await readRunArtifact(services, input)
        const encoded = Buffer.from(data).toString("base64")
        const attachment =
          metadata.artifact.contentType === "image/png"
            ? { type: "image" as const, mimeType: "image/png", data: encoded }
            : {
                type: "resource" as const,
                resource: {
                  uri: `redpact://runs/${input.id}/${input.side}/${input.artifactId}`,
                  mimeType: metadata.artifact.contentType,
                  blob: encoded,
                },
              }
        return { ...output(metadata), content: [...output(metadata).content, attachment] }
      } catch (error) {
        return invoke(() => {
          throw error
        })
      }
    },
  )
  server.registerTool(
    "project_container",
    {
      description:
        "Inspect/start/restart/stop the observed project's manual Compose environment. path identifies the actual worktree; each worktree owns its persistent manual environment until explicit stop. Stop only owns the manual environment and cannot stop test executions. Inspect is read-only; other actions are explicit manual lifecycle requests, independent of test approval.",
      inputSchema: z.strictObject({
        path: verificationPath,
        action: z.enum(["inspect", "start", "restart", "stop"]),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ path, action }) => invoke(() => projectContainer(services, path, action)),
  )
}
