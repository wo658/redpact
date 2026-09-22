import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { Updates } from "../../core/types/updates.js"
import { updateStatusSchema } from "../../core/updates.js"
import { jsonResponse, localErrors } from "./docs/metadata.js"

export function updateRoutes(updates: Updates) {
  const response = {
    ...localErrors,
    200: jsonResponse(updateStatusSchema, "Cached update state, including registry errors."),
  }
  return new Hono()
    .post(
      "/updates/install",
      describeRoute({
        operationId: "installRuntimeUpdate",
        summary: "Request confirmed npm update and idle restart",
        tags: ["Server"],
        responses: {
          ...localErrors,
          200: jsonResponse(
            z.object({ accepted: z.literal(true) }),
            "Update accepted by the CLI supervisor.",
          ),
          409: { description: "Update changed or work is active." },
        },
      }),
      zValidator("json", z.object({ version: z.string().min(1).max(100) }).strict()),
      async (c) => c.json(await updates.install(c.req.valid("json").version)),
    )
    .get(
      "/updates",
      describeRoute({
        operationId: "getUpdateStatus",
        summary: "Read cached runtime update status",
        tags: ["Server"],
        responses: response,
      }),
      (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(updates.status())
      },
    )
    .post(
      "/updates/check",
      describeRoute({
        operationId: "checkRuntimeUpdate",
        summary: "Check npm for a newer runtime without installing",
        tags: ["Server"],
        responses: response,
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await updates.check())
      },
    )
}
