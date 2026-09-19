import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { approvalPolicySchema } from "../../core/review-schema.js"
import type { ReviewTests } from "../../core/types/reviews.js"
import { inputErrors, jsonBody, jsonResponse, localErrors } from "./docs/metadata.js"

const policyInput = z.strictObject({ policy: approvalPolicySchema })
export function approvalPolicyRoutes(reviews: ReviewTests) {
  const response = {
    ...localErrors,
    200: jsonResponse(policyInput, "Instance policy for future MCP test requests."),
  }
  return new Hono()
    .get(
      "/approval-policy",
      describeRoute({
        operationId: "getApprovalPolicy",
        summary: "Read MCP approval policy",
        tags: ["Settings"],
        responses: response,
      }),
      (c) => c.json({ policy: reviews.policy() }),
    )
    .post(
      "/approval-policy",
      describeRoute({
        operationId: "setApprovalPolicy",
        summary: "Set approval policy for future MCP requests",
        tags: ["Settings"],
        requestBody: jsonBody(policyInput),
        responses: { ...response, ...inputErrors },
      }),
      zValidator("json", policyInput),
      (c) =>
        c.json({ policy: reviews.changePolicy(reviews.capability(), c.req.valid("json").policy) }),
    )
}
