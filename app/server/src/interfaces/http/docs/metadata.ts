import { resolver } from "hono-openapi"
import type { z } from "zod"

export function jsonResponse(schema: z.ZodType, description: string) {
  return { description, content: { "application/json": { schema: resolver(schema) } } }
}
export function jsonBody(schema: z.ZodType) {
  return {
    required: true,
    content: { "application/json": { schema: resolver(schema, { io: "input" }) } },
  }
}
export const localErrors = {
  403: {
    description: "The Host is not loopback or the browser Origin differs from the server origin.",
  },
  500: { description: "Unexpected server error." },
}
export const inputErrors = {
  400: {
    description:
      "Invalid input or malformed JSON. Zod validation failures return { success: false, error: { name, message } }; core input failures return { error }.",
  },
  413: { description: "Request body exceeds 1 MiB." },
}
export const notFound = { 404: { description: "The requested record was not found." } }
export const conflict = {
  409: {
    description:
      "The target, settings, worktree, environment, or operation conflicts with its current state; returns { code, error }. Incomplete worktree creation also returns recovery guidance.",
  },
}
export const invalidSettings = {
  422: {
    description:
      "Invalid or unsupported settings. Run rejection returns { error, validation? }; settings inspection returns SettingsValidation.",
  },
}
