import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { projectEntry } from "../../core/project-files-schema.js"
import type { ProjectFiles } from "../../core/types/project-files.js"
import { inputErrors, jsonResponse, localErrors, notFound } from "./docs/metadata.js"

export function projectFileRoutes(service: ProjectFiles) {
  return new Hono().get(
    "/projects/:id/files",
    describeRoute({
      operationId: "getProjectFile",
      summary:
        "Browse the primary project directory and preview UTF-8 files up to 1 MiB and images up to 5 MiB",
      tags: ["Projects"],
      responses: {
        ...localErrors,
        ...notFound,
        ...inputErrors,
        200: jsonResponse(projectEntry, "Directory or file preview"),
      },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store")
      return c.json(await service.read(c.req.param("id"), c.req.query("path") ?? ""))
    },
  )
}
