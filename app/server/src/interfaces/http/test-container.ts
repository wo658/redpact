import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { projectEntry } from "../../core/project-files-schema.js"
import type { TestContainer } from "../../core/types/test-container.js"
import { conflict, inputErrors, jsonResponse, localErrors, notFound } from "./docs/metadata.js"
import { environmentResponse, worktreeResponse } from "./docs/schemas.js"

const inspection = z.object({
  composeFiles: z.array(z.string()),
  target: worktreeResponse.nullable(),
  environment: environmentResponse.nullable(),
  changed: z.boolean().nullable(),
  issue: z.string().nullable(),
})
export function testContainerRoutes(service: TestContainer) {
  const routes = new Hono().get(
    "/:id/test-container",
    describeRoute({
      operationId: "inspectTestContainer",
      summary: "Inspect the main branch Test Container and current input changes",
      tags: ["Environments"],
      responses: {
        ...localErrors,
        ...notFound,
        200: jsonResponse(
          inspection,
          "Current manual environment; inspection never starts or restarts it.",
        ),
      },
    }),
    async (c) => c.json(await service.inspect(c.req.param("id"))),
  )
  routes.get(
    "/:id/test-container/compose",
    describeRoute({
      operationId: "getTestContainerCompose",
      summary: "Read a configured Compose file from the main branch checkout",
      tags: ["Environments"],
      responses: {
        ...localErrors,
        ...notFound,
        ...inputErrors,
        200: jsonResponse(projectEntry, "Compose source preview"),
      },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store")
      return c.json(await service.composeSource(c.req.param("id"), c.req.query("path") ?? ""))
    },
  )
  for (const action of ["start", "restart", "stop"] as const) {
    routes.post(
      `/:id/test-container/${action}`,
      describeRoute({
        operationId: `${action}TestContainer`,
        summary: `${action} the project's manual Test Container`,
        tags: ["Environments"],
        description:
          "Uses the configured main branch checkout and project Integration defaults. Restart waits for owned-resource removal before capturing current inputs. Stop remains available when the checkout is missing. Poll inspection for preparation state.",
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          ...inputErrors,
          202: jsonResponse(inspection, "Manual operation accepted."),
        },
      }),
      async (c) => c.json(await service[action](c.req.param("id")), 202),
    )
  }
  return routes
}
