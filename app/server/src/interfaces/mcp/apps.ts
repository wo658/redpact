import { readFileSync } from "node:fs"
import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { approvalPolicySchema } from "../../core/review-schema.js"
import { testSelectionSchema } from "../../core/settings-schema.js"
import type { ReviewTests, ReviewView } from "../../core/types/reviews.js"

export const environmentResource = "ui://redpact/environment.html"
export const testsResource = "ui://redpact/tests.html"
export const uiMeta = (resourceUri: string) => ({ ui: { resourceUri } })

export function reviewResult(view: ReviewView, service: ReviewTests, kind = "review") {
  const { review, submission, run } = view
  const value = run ?? {
    id: review.id,
    state: review.state === "pending" ? "awaiting_approval" : review.state,
    submissionId: submission.id,
    error: review.error,
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ...value, reviewId: review.id, approval: review.policy }),
      },
    ],
    structuredContent: { ...value, reviewId: review.id, approval: review.policy },
    _meta: {
      redpact: {
        kind,
        review,
        submission,
        run,
        policy: review.policy,
        nextPolicy: service.policy(),
        token: service.capability(review.id),
      },
    },
  }
}

export function registerApps(server: McpServer, reviews?: ReviewTests) {
  for (const [name, uri] of [
    ["environment", environmentResource],
    ["tests", testsResource],
  ]) {
    server.registerResource(
      name,
      uri,
      { mimeType: "text/html;profile=mcp-app", description: `Redpact ${name} snapshot` },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "text/html;profile=mcp-app",
            text: readFileSync(new URL("../../../dist/mcp/app.html", import.meta.url), "utf8"),
            _meta: {
              ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
            },
          },
        ],
      }),
    )
  }
  if (!reviews) {
    return
  }
  server.registerTool(
    "review_action",
    {
      description: "Apply an explicit action from the Redpact review UI. UI capability required.",
      inputSchema: z.strictObject({
        id: z.string().uuid(),
        token: z.string().min(32),
        revision: z.number().int().nonnegative(),
        subject: z.enum(["environment", "tests"]),
        selection: testSelectionSchema.optional(),
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
        return reviewResult(await reviews.approve(input), reviews)
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: error instanceof Error ? error.message : "Approval failed" },
          ],
        }
      }
    },
  )
  server.registerTool(
    "set_approval_policy",
    {
      description:
        "Change the instance approval policy for future requests only. UI capability required.",
      inputSchema: z.strictObject({ token: z.string().min(32), policy: approvalPolicySchema }),
      _meta: { ui: { visibility: ["app"] } },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ token, policy }) => {
      try {
        return {
          content: [{ type: "text", text: "Applies from the next request" }],
          structuredContent: { policy: reviews.changePolicy(token, policy) },
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text", text: error instanceof Error ? error.message : "Policy update failed" },
          ],
        }
      }
    },
  )
}
