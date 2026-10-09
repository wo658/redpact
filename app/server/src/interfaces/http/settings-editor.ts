import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { SettingsEditor } from "../../core/types/settings-editor.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

const document = z.object({
  file: z.string(),
  source: z.string().nullable(),
  revision: z.string().nullable(),
  value: z.record(z.string(), z.unknown()).optional(),
  issues: z.array(z.string()),
})
function metadata(operationId: string) {
  return describeRoute({
    operationId,
    summary: "Read authored settings and schema defaults without Git status or provisioning",
    tags: ["Settings"],
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
    .get("/instance/settings", metadata("readInstanceSettings"), async (c) =>
      c.json(await service.instance()),
    )
}
