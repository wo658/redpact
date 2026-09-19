import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { ReviewContentService } from "../../core/types/review-content.js"
import { jsonResponse, localErrors, notFound } from "./docs/metadata.js"

export function reviewContentRoutes(service: ReviewContentService) {
  return new Hono().get(
    "/worktrees/:id/review-content",
    describeRoute({
      operationId: "inspectReviewContent",
      summary:
        "Check review tab availability without reading source bodies or fingerprinting application inputs",
      tags: ["Worktrees"],
      responses: {
        ...localErrors,
        ...notFound,
        200: jsonResponse(
          z.object({
            preview: z.boolean(),
            unit: z.boolean(),
            tests: z.boolean(),
            log: z.boolean(),
            environment: z.boolean(),
          }),
          "Confirmed content or reachable diagnostics and active execution",
        ),
      },
    }),
    async (c) => c.json(await service.inspect(c.req.param("id"))),
  )
}
