import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { UnitTestsService } from "../../core/types/unit-tests.js"
import { unitRunSchema } from "../../core/unit-test-schema.js"
import { conflict, inputErrors, jsonResponse, localErrors, notFound } from "./docs/metadata.js"

export function unitTestRoutes(service: UnitTestsService) {
  const docs = (operationId: string, summary: string, schema: z.ZodType = unitRunSchema) =>
    describeRoute({
      operationId,
      summary,
      tags: ["Unit tests"],
      responses: {
        ...localErrors,
        ...notFound,
        ...inputErrors,
        ...conflict,
        200: jsonResponse(schema, summary),
      },
    })
  return new Hono()
    .get(
      "/worktrees/:id/unit-tests",
      docs(
        "inspectUnitTests",
        "Read unit test files in the requested scope and command runs",
        z.object({ settings: z.unknown(), catalog: z.unknown(), runs: z.array(unitRunSchema) }),
      ),
      zValidator("query", z.object({ scope: z.enum(["changed", "all"]).default("changed") })),
      async (c) => c.json(await service.inspect(c.req.param("id"), c.req.valid("query").scope)),
    )
    .post(
      "/worktrees/:id/unit-tests/run",
      docs("runUnitCommand", "Run the configured whole command in a fresh worktree container"),
      async (c) => c.json(await service.start(c.req.param("id"))),
    )
    .get("/unit-runs/:id", docs("getUnitRun", "Read command output and exit status"), (c) =>
      c.json(service.get(c.req.param("id"))),
    )
    .post(
      "/unit-runs/:id/cancel",
      docs("cancelUnitRun", "Cancel a unit command or retry its container cleanup"),
      async (c) => c.json(await service.cancel(c.req.param("id"))),
    )
}
