import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { ProjectSecrets } from "../../core/types/project-secrets.js"
import { inputErrors, jsonBody, jsonResponse, localErrors, notFound } from "./docs/metadata.js"

const status = z.object({ name: z.string(), configured: z.boolean() })

export function projectSecretRoutes(service: ProjectSecrets) {
  return new Hono()
    .get(
      "/projects/:id/secrets",
      describeRoute({
        operationId: "getProjectSecrets",
        summary: "Read declared secret availability without values",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(z.array(status), "Declared secrets"),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await service.list(c.req.param("id")))
      },
    )
    .get(
      "/projects/:id/secrets/:name",
      describeRoute({
        operationId: "getProjectSecretValue",
        summary: "Read a declared credential value for the local environment editor",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(z.object({ value: z.string() }), "Current value"),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await service.value(c.req.param("id"), c.req.param("name")))
      },
    )
    .put(
      "/projects/:id/secrets/:name",
      describeRoute({
        operationId: "setProjectSecret",
        summary: "Set or clear a user-provided project secret",
        tags: ["Projects"],
        requestBody: jsonBody(z.strictObject({ value: z.string().max(10000) })),
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(status, "Updated availability"),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        const body = await c.req.json().catch(() => null)
        if (
          !body ||
          typeof body !== "object" ||
          Object.keys(body).length !== 1 ||
          typeof body.value !== "string"
        ) {
          return c.json({ error: "Expected a secret value" }, 400)
        }
        return c.json(await service.set(c.req.param("id"), c.req.param("name"), body.value))
      },
    )
}
