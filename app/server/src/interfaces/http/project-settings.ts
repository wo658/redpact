import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { trackingSchema } from "../../core/tracking-schema.js"
import type { ProjectSettingsService } from "../../core/types/services.js"
import { jsonResponse, localErrors, notFound } from "./docs/metadata.js"

export function projectSettingsRoutes(service: ProjectSettingsService) {
  return new Hono().get(
    "/projects/:id/tracking",
    describeRoute({
      operationId: "getProjectTracking",
      summary: "Read project tracking preferences",
      tags: ["Projects"],
      responses: {
        ...localErrors,
        ...notFound,
        200: jsonResponse(
          z.object({
            projectRoot: z.string(),
            tracking: trackingSchema,
          }),
          "Tracking preferences",
        ),
      },
    }),
    async (c) => c.json(await service.read(c.req.param("id"))),
  )
}
