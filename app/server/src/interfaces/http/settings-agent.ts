import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { SettingsAgent } from "../../workflows/settings-agent.js"
import {
  settingsGet,
  settingsPatch,
  settingsRepair,
  settingsTarget,
} from "../../workflows/settings-agent.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

function metadata(action: string, input: z.ZodType) {
  return describeRoute({
    operationId: `agentSettings${action[0].toUpperCase()}${action.slice(1)}`,
    summary: `Agent settings ${action} with authored values and revision protection`,
    tags: ["Settings"],
    requestBody: jsonBody(input),
    responses: {
      ...localErrors,
      ...inputErrors,
      ...invalidSettings,
      ...conflict,
      ...notFound,
      200: jsonResponse(z.record(z.string(), z.unknown()), "Settings result"),
    },
  })
}
const invalid = (
  result: { success: boolean },
  c: { json: (value: unknown, status: 400) => Response },
) => {
  if (!result.success) {
    return c.json({ code: "invalid_input", message: "Invalid settings request" }, 400)
  }
}
export function settingsAgentRoutes(service: SettingsAgent) {
  return new Hono()
    .post(
      "/describe",
      metadata("describe", settingsTarget),
      zValidator("json", settingsTarget, invalid),
      async (c) => c.json(await service.describe(c.req.valid("json"))),
    )
    .post(
      "/get",
      metadata("get", settingsGet),
      zValidator("json", settingsGet, invalid),
      async (c) => c.json(await service.get(c.req.valid("json"))),
    )
    .post(
      "/patch",
      metadata("patch", settingsPatch),
      zValidator("json", settingsPatch, invalid),
      async (c) => c.json(await service.patch(c.req.valid("json"))),
    )
    .post(
      "/validate",
      metadata("validate", settingsTarget),
      zValidator("json", settingsTarget, invalid),
      async (c) => c.json(await service.validate(c.req.valid("json"))),
    )
    .post(
      "/repair",
      metadata("repair", settingsRepair),
      zValidator("json", settingsRepair, invalid),
      async (c) => c.json(await service.repair(c.req.valid("json"))),
    )
}
