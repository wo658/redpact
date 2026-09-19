import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { captureRunSchema } from "../../core/playwright-schema.js"
import { name, testSelectionSchema } from "../../core/settings-schema.js"
import type {
  CaptureService,
  CaptureWorkflow,
  PlaywrightCatalog,
} from "../../core/types/playwright.js"
import { jsonResponse, localErrors } from "./docs/metadata.js"

const captureInputSchema = z.strictObject({
  selection: testSelectionSchema.optional(),
  target: name.optional(),
  viewport: z
    .strictObject({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
    })
    .optional(),
})
export function playwrightRoutes(
  captures: CaptureService,
  workflow: CaptureWorkflow,
  catalog?: PlaywrightCatalog,
) {
  const docs = (operationId: string, summary: string, schema: z.ZodType = captureRunSchema) =>
    describeRoute({
      operationId,
      summary,
      tags: ["Playwright"],
      responses: { ...localErrors, 200: jsonResponse(schema, summary) },
    })
  return new Hono()
    .get(
      "/projects/:id/playwright",
      docs(
        "projectPlaywrightCatalog",
        "List declared Playwright files without executing them",
        z.unknown(),
      ),
      async (c) => {
        if (!catalog) {
          return c.notFound()
        }
        return c.json(await catalog.inspect(c.req.param("id")))
      },
    )
    .get("/projects/:id/playwright/source", async (c) => {
      if (!catalog) {
        return c.notFound()
      }
      return c.text(await catalog.source(c.req.param("id"), c.req.query("path") ?? ""))
    })
    .get(
      "/projects/:id/playwright-runs",
      docs(
        "listProjectPlaywright",
        "Read retained project Playwright history",
        z.object({ runs: z.array(captureRunSchema) }),
      ),
      (c) => c.json({ runs: captures.listProject(c.req.param("id")) }),
    )
    .get(
      "/worktrees/:id/playwright/catalog",
      docs(
        "worktreePlaywrightCatalog",
        "List worktree drafts and changed project Playwright sources",
        z.unknown(),
      ),
      async (c) => {
        if (!catalog) {
          return c.notFound()
        }
        return c.json(await catalog.worktree(c.req.param("id")))
      },
    )
    .get(
      "/worktrees/:id/playwright",
      docs("inspectPlaywright", "Read Playwright configuration and stored captures", z.unknown()),
      async (c) => c.json(await workflow.inspect(c.req.param("id"))),
    )
    .post(
      "/worktrees/:id/playwright/run",
      docs(
        "runPlaywright",
        "Run a configured functional or capture target against the actual application in Docker",
      ),
      zValidator("json", captureInputSchema),
      async (c) => {
        const input = c.req.valid("json")
        return c.json(
          await workflow.start(c.req.param("id"), input.selection, input.viewport, input.target),
        )
      },
    )
    .post(
      "/worktrees/:id/playwright/cleanup-worktree",
      docs(
        "cleanupPlaywrightWorktree",
        "Remove recorded worktree sources, preserving execution history",
        z.object({ cleaned: z.boolean() }),
      ),
      async (c) => {
        await workflow.cleanupWorktree(c.req.param("id"))
        return c.json({ cleaned: true })
      },
    )
    .get("/playwright-runs/:id/source", async (c) =>
      c.text(await captures.source(c.req.param("id"), c.req.query("path") ?? "")),
    )
    .get("/playwright-runs/:id", docs("readPlaywright", "Read a captured execution"), (c) =>
      c.json(captures.get(c.req.param("id"))),
    )
    .post(
      "/playwright-runs/:id/cancel",
      docs("cancelPlaywright", "Cancel capture or retry resource cleanup"),
      async (c) => c.json(await workflow.cancel(c.req.param("id"))),
    )
    .get(
      "/playwright-runs/:id/:side/artifacts/:artifact",
      zValidator("param", z.object({ side: z.enum(["before", "after"]) })),
      async (c) => {
        const side = c.req.valid("param").side
        const artifact = await captures.artifact(c.req.param("id"), side, c.req.param("artifact"))
        c.header("Content-Type", artifact.contentType)
        c.header("Cache-Control", "private, max-age=31536000, immutable")
        if (artifact.contentType === "application/zip") {
          c.header("Content-Disposition", 'attachment; filename="trace.zip"')
        }
        return c.body(new Uint8Array(artifact.data))
      },
    )
}
