import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { trackingSchema } from "../../core/tracking-schema.js"
import type { ProjectSettingsService } from "../../core/types/services.js"
import { inputErrors, jsonBody, jsonResponse, localErrors, notFound } from "./docs/metadata.js"
import { projectResponse } from "./docs/schemas.js"

export function projectSettingsRoutes(service: ProjectSettingsService) {
  return new Hono()
    .get(
      "/projects/:id/branch-reviews",
      describeRoute({
        operationId: "getBranchReviews",
        summary: "Read local branches and worktree availability",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(
            z.array(
              z.object({
                name: z.string(),
                revision: z.string(),
                merged: z.boolean(),
                worktrees: z.array(z.object({ path: z.string(), missing: z.boolean() })),
              }),
            ),
            "Local branch review catalog",
          ),
        },
      }),
      async (c) => c.json(await service.branchReviews(c.req.param("id"))),
    )
    .get(
      "/projects/:id/branch-diff",
      describeRoute({
        operationId: "getBranchDiff",
        summary: "Read committed branch changes without checking out files",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(
            z.object({
              available: z.boolean(),
              revision: z.string().nullable().optional(),
              baseRevision: z.string().optional(),
              reason: z.string().optional(),
              patch: z.string(),
              omitted: z.array(z.string()),
            }),
            "Committed branch diff",
          ),
        },
      }),
      zValidator("query", z.object({ branch: z.string().min(1).max(1024) })),
      async (c) => c.json(await service.branchDiff(c.req.param("id"), c.req.valid("query").branch)),
    )
    .get(
      "/projects/:id/branches",
      describeRoute({
        operationId: "getProjectBranches",
        summary: "Read local branch names without inspecting working files",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(z.array(z.string()), "Local branches"),
        },
      }),
      async (c) => c.json(await service.branches(c.req.param("id"))),
    )
    .get(
      "/projects/:id/tracking",
      describeRoute({
        operationId: "getProjectTracking",
        summary: "Read project tracking preferences",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              projectRoot: z.string(),
              tracking: trackingSchema,
            }),
            "Tracking preferences",
          ),
        },
      }),
      async (c) => c.json(await service.read(c.req.param("id"))),
    )
    .post(
      "/projects/:id/tracking",
      describeRoute({
        operationId: "setProjectTracking",
        summary: "Update project tracking preferences",
        tags: ["Projects"],
        requestBody: jsonBody(trackingSchema),
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          200: jsonResponse(projectResponse, "Updated project"),
        },
      }),
      zValidator("json", trackingSchema),
      async (c) => c.json(await service.update(c.req.param("id"), c.req.valid("json"))),
    )
}
