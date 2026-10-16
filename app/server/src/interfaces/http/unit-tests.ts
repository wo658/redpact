import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { executionScopeSchema } from "../../core/execution-selection-schema.js"
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
      "/worktrees/:id/unit-tests/source",
      docs(
        "getUnitTestSource",
        "Read one configured unit test source without execution",
        z.object({ path: z.string(), source: z.string().nullable(), issue: z.string().optional() }),
      ),
      zValidator("query", z.object({ path: z.string().min(1) })),
      async (c) => c.json(await service.source(c.req.param("id"), c.req.valid("query").path)),
    )
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
      zValidator("json", z.strictObject({ executionScope: executionScopeSchema.optional() })),
      async (c) =>
        c.json(
          await service.start(c.req.param("id"), undefined, c.req.valid("json").executionScope),
        ),
    )
    .get("/unit-runs/:id", docs("getUnitRun", "Read command output and exit status"), (c) =>
      c.json(service.get(c.req.param("id"))),
    )
}
