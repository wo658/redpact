import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { EnvironmentService, StopEnvironment } from "../../core/types/services.js"
import { conflict, inputErrors, jsonResponse, localErrors, notFound } from "./docs/metadata.js"
import { environmentResponse } from "./docs/schemas.js"
export const listEnvironmentInput = z.strictObject({ worktreeId: z.string().uuid() })
export function environmentRoutes(
  environments: EnvironmentService,
  stopEnvironment: StopEnvironment,
) {
  return new Hono()
    .get(
      "/",
      describeRoute({
        operationId: "listEnvironments",
        summary: "List worktree environments",
        tags: ["Environments"],
        description:
          "Returns stored environment records for worktreeId. This does not refresh Docker state.",
        parameters: [
          {
            name: "worktreeId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Worktree ID whose stored environments should be listed.",
          },
        ],
        responses: {
          ...localErrors,
          ...inputErrors,
          200: jsonResponse(z.array(environmentResponse), "List worktree environments response."),
        },
      }),
      zValidator("query", listEnvironmentInput),
      (c) => c.json(environments.list(c.req.valid("query").worktreeId)),
    )
    .get(
      "/:id",
      describeRoute({
        operationId: "getEnvironment",
        summary: "Observe an environment",
        tags: ["Environments"],
        description:
          "Refreshes observed resources and health before returning the environment record.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(environmentResponse, "Observe an environment response."),
        },
      }),
      async (c) => c.json(await environments.refresh(c.req.param("id"))),
    )
    .post(
      "/:id/stop",
      describeRoute({
        operationId: "stopEnvironment",
        summary: "Stop an environment",
        tags: ["Environments"],
        description:
          "Cancels linked execution before asynchronously removing owned resources and captured runtime files, preserving logs and immutable test evidence. Poll until stopped; stop_failed retains resources for retry.",
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          202: jsonResponse(environmentResponse, "Stop an environment response."),
        },
      }),
      async (c) => c.json(await stopEnvironment(c.req.param("id")), 202),
    )
}
