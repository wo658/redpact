import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { SettingsEditor } from "../../core/types/settings-editor.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

const input = z.strictObject({ source: z.string().max(262144), revision: z.string().nullable() })
const document = z.object({
  file: z.string(),
  source: z.string().nullable(),
  revision: z.string().nullable(),
  value: z.record(z.string(), z.unknown()).optional(),
  issues: z.array(z.string()),
})
function metadata(operationId: string, save = false) {
  return describeRoute({
    operationId,
    summary: save
      ? "Validate and save authored settings with a source revision"
      : "Read authored settings and schema defaults without Git status or provisioning",
    tags: ["Settings"],
    ...(save ? { requestBody: jsonBody(input) } : {}),
    responses: {
      ...localErrors,
      ...inputErrors,
      ...invalidSettings,
      ...conflict,
      ...notFound,
      200: jsonResponse(document, "Authored settings"),
    },
  })
}
export function settingsEditorRoutes(service: SettingsEditor) {
  return new Hono()
    .get("/projects/:id/configuration", metadata("readProjectConfiguration"), async (c) =>
      c.json(await service.project(c.req.param("id"))),
    )
    .put(
      "/projects/:id/configuration",
      metadata("saveProjectConfiguration", true),
      zValidator("json", input),
      async (c) => c.json(await service.saveProject(c.req.param("id"), c.req.valid("json"))),
    )
    .get("/instance/settings", metadata("readInstanceSettings"), async (c) =>
      c.json(await service.instance()),
    )
    .put(
      "/instance/settings",
      metadata("saveInstanceSettings", true),
      zValidator("json", input),
      async (c) => c.json(await service.saveInstance(c.req.valid("json"))),
    )
}
