import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { reviewContextSchema, workspaceStatusSchema } from "../../core/chat-context-schema.js"
import { reviewContextInput, workspaceStatusInput } from "../../core/verification-schema.js"
import {
  approveReview,
  getReviewContext,
  getWorkspaceStatus,
} from "../../workflows/chat-context.js"
import type { Services } from "../../workflows/services.js"
import {
  conflict,
  inputErrors,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

export function chatContextRoutes(services: Services) {
  const approvalInput = z.strictObject({
    revision: z.number().int().nonnegative(),
    subject: z.enum(["environment", "tests"]).optional(),
  })
  function docs(operationId: string, summary: string, schema: z.ZodType, body?: z.ZodType) {
    return describeRoute({
      operationId,
      summary,
      tags: ["Review"],
      ...(body ? { requestBody: jsonBody(body) } : {}),
      responses: {
        ...localErrors,
        ...inputErrors,
        ...notFound,
        ...conflict,
        200: jsonResponse(schema, summary),
      },
    })
  }
  return new Hono()
    .get(
      "/workspace-status",
      docs(
        "getWorkspaceStatus",
        "Read checkout settings and verification attention without registration or execution",
        workspaceStatusSchema,
      ),
      zValidator("query", workspaceStatusInput),
      async (c) => c.json(await getWorkspaceStatus(services, c.req.valid("query").path)),
    )
    .get(
      "/review-context",
      docs(
        "getReviewContext",
        "Read bounded execution evidence and its stable viewer address",
        reviewContextSchema,
      ),
      zValidator("query", reviewContextInput),
      (c) => c.json(getReviewContext(services, c.req.valid("query"))),
    )
    .post(
      "/execution-reviews/:kind/:id/approve",
      docs(
        "approveExecutionReview",
        "Explicit viewer approval of an immutable pending request",
        reviewContextSchema,
        approvalInput,
      ),
      zValidator("param", reviewContextInput),
      zValidator("json", approvalInput),
      async (c) =>
        c.json(await approveReview(services, { ...c.req.valid("param"), ...c.req.valid("json") })),
    )
}
