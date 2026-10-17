import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { problem } from "../../core/problems.js"
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
      parameters: [
        {
          name: "trackedOnly",
          in: "query",
          required: false,
          schema: { type: "boolean", default: false },
          description:
            "Show only Git-index files and their parent directories; requires a Git checkout.",
        },
      ],
      responses: {
        ...localErrors,
        ...notFound,
        ...inputErrors,
        200: jsonResponse(projectEntry, "Directory or file preview"),
      },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store")
      const trackedOnly = c.req.query("trackedOnly")
      if (trackedOnly !== undefined && trackedOnly !== "true" && trackedOnly !== "false") {
        problem("invalid_input", "trackedOnly must be true or false")
      }
      return c.json(
        await service.read(c.req.param("id"), c.req.query("path") ?? "", trackedOnly === "true"),
      )
    },
  )
}
