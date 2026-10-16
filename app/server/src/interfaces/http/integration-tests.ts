import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { IntegrationTestsService } from "../../core/types/integration-tests.js"
import type { Services } from "../../workflows/services.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"
import { runResponse } from "./docs/schemas.js"

export function integrationTestRoutes(
  service: IntegrationTestsService,
  runWorktreeTests?: Services["runWorktreeTests"],
) {
  const routes = new Hono()
    .get(
      "/worktrees/:id/integration-tests/source",
      describeRoute({
        operationId: "getIntegrationTestSource",
        summary: "Read one configured integration source without execution",
        tags: ["Submissions"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              path: z.string(),
              source: z.string().nullable(),
              issue: z.string().optional(),
            }),
            "Selected current source or a file preview diagnostic.",
          ),
        },
      }),
      zValidator("query", z.object({ path: z.string().min(1) })),
      async (c) => c.json(await service.source(c.req.param("id"), c.req.valid("query").path)),
    )
    .get(
      "/worktrees/:id/integration-tests",
      describeRoute({
        operationId: "inspectIntegrationTests",
        summary: "Read integration test file metadata without execution",
        tags: ["Submissions"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              directory: z.string(),
              catalog: z.object({
                baseRevision: z.string().optional(),
                diagnostics: z.array(z.string()),
                files: z.array(
                  z.object({
                    path: z.string(),
                  }),
                ),
              }),
            }),
            "Current sources in the requested scope; recorded execution sources remain immutable.",
          ),
        },
      }),
      zValidator("query", z.object({ scope: z.enum(["changed", "all"]).default("changed") })),
      async (c) => c.json(await service.inspect(c.req.param("id"), c.req.valid("query").scope)),
    )
  if (runWorktreeTests) {
    routes.post(
      "/worktrees/:id/integration-tests/run",
      describeRoute({
        operationId: "runWorktreeIntegrationTests",
        summary: "Collect current integration sources and run with project integration defaults",
        tags: ["Runs"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          ...invalidSettings,
          202: jsonResponse(runResponse, "Fresh immutable submission queued for execution."),
        },
      }),
      async (c) => c.json(await runWorktreeTests(c.req.param("id")), 202),
    )
  }
  return routes
}
