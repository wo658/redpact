import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { problem } from "../../core/problems.js"
import type { DirectoryPicker } from "../../core/types/directory-picker.js"
import { jsonResponse, localErrors } from "./docs/metadata.js"

export function directoryPickerRoutes(picker?: DirectoryPicker) {
  return new Hono().post(
    "/dialogs/directory",
    describeRoute({
      operationId: "pickProjectDirectory",
      summary: "Select a project folder in the server's OS dialog",
      tags: ["Projects"],
      description:
        "Explicit desktop interaction only. Returns an absolute path or null on cancellation. Does not connect projects, upload files or run project code. Only one dialog may be open per server; requests expire after two minutes.",
      responses: {
        ...localErrors,
        200: jsonResponse(
          z.object({ path: z.string().nullable() }),
          "Selected folder or cancellation.",
        ),
        409: { description: "A folder selection dialog is already open." },
        502: { description: "Native folder selection failed or timed out." },
        503: { description: "Desktop folder selection is unavailable." },
      },
    }),
    async (c) => {
      if (!picker) {
        problem(
          "directory_picker_unavailable",
          "Folder selection is unavailable. Enter the project path manually.",
        )
      }
      c.header("Cache-Control", "no-store")
      return c.json({ path: await picker.pick(c.req.raw.signal) })
    },
  )
}
