import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { pluginAgentSchema, pluginUpdatesStateSchema } from "../../core/plugin-updates.js"
import type { PluginUpdates } from "../../core/types/plugin-updates.js"
import { inputErrors, jsonResponse, localErrors } from "./docs/metadata.js"

export function pluginUpdateRoutes(service: PluginUpdates) {
  const metadata = (operationId: string, summary: string) =>
    describeRoute({
      operationId,
      summary,
      tags: ["Settings"],
      responses: {
        ...localErrors,
        ...inputErrors,
        200: jsonResponse(pluginUpdatesStateSchema, "Redpact plugin update status"),
        409: { description: "Check again before installing." },
      },
    })
  return new Hono()
    .use("*", async (c, next) => {
      c.header("Cache-Control", "no-store")
      await next()
    })
    .get(
      "/plugin-updates",
      metadata("getPluginUpdates", "Read cached agent plugin versions"),
      (c) => c.json(service.status()),
    )
    .post(
      "/plugin-updates/check",
      metadata(
        "checkPluginUpdates",
        "Check installed Redpact plugins for newer marketplace versions",
      ),
      async (c) => c.json(await service.check()),
    )
    .post(
      "/plugin-updates/install",
      metadata(
        "installPluginUpdate",
        "Install the confirmed Redpact plugin with its owning agent CLI",
      ),
      zValidator(
        "json",
        z.strictObject({ agent: pluginAgentSchema, version: z.string().min(1).max(100) }),
      ),
      async (c) => {
        const { agent, version } = c.req.valid("json")
        return c.json(await service.install(agent, version))
      },
    )
}
