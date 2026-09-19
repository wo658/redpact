import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { testSelectionSchema } from "../../core/settings-schema.js"
import { startWorkInput } from "../../core/start-work-schema.js"
import type { WorkStarts, WorktreeService } from "../../core/types/services.js"
import { createWorktreeInspection } from "../../workflows/inspection.js"
import { projectInput, worktreeInput } from "../schemas.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"
import {
  dependenciesResponse,
  gitResponse,
  projectResponse,
  startedWorkResponse,
  workStartResponse,
  worktreeResponse,
  worktreeSettingsResponse,
} from "./docs/schemas.js"

export function worktreeRoutes(service: WorktreeService, starts?: WorkStarts) {
  const inspection = createWorktreeInspection(service)
  const imageSide = z
    .union([z.object({ dataUrl: z.string() }), z.object({ error: z.string() })])
    .nullable()
  const selectionResponse = z.object({ selection: testSelectionSchema.nullable() })
  const app = new Hono()
    .get(
      "/projects/:id/integration-defaults",
      describeRoute({
        operationId: "getProjectIntegrationDefaults",
        summary: "Read project integration defaults or automatic choices",
        tags: ["Projects"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          ...invalidSettings,
          200: jsonResponse(
            z.object({
              selection: testSelectionSchema.extend({
                services: testSelectionSchema.shape.services.min(0),
              }),
              saved: z.boolean(),
            }),
            "Project integration choices",
          ),
        },
      }),
      async (c) => c.json(await service.getIntegrationDefaults(c.req.param("id"))),
    )
    .put(
      "/projects/:id/integration-defaults",
      describeRoute({
        operationId: "setProjectIntegrationDefaults",
        summary: "Save project integration defaults without execution",
        tags: ["Projects"],
        requestBody: jsonBody(testSelectionSchema),
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          ...invalidSettings,
          200: jsonResponse(selectionResponse, "Saved project integration choices"),
        },
      }),
      zValidator("json", testSelectionSchema),
      async (c) =>
        c.json({
          selection: await service.setIntegrationDefaults(c.req.param("id"), c.req.valid("json")),
        }),
    )
    .get(
      "/worktrees/:id/selection",
      describeRoute({
        operationId: "getWorktreeSelection",
        summary: "Read saved worktree execution choices",
        tags: ["Worktrees"],
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(
            selectionResponse,
            "Saved choices, or null before the first selection.",
          ),
        },
      }),
      async (c) => c.json({ selection: await service.getSelection(c.req.param("id")) }),
    )
    .put(
      "/worktrees/:id/selection",
      describeRoute({
        operationId: "setWorktreeSelection",
        summary: "Save worktree execution choices",
        description:
          "Validates shared rules against this checkout and saves only this worktree's choices. Does not edit project files, prepare environments or approve execution.",
        tags: ["Worktrees"],
        requestBody: jsonBody(testSelectionSchema),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          ...invalidSettings,
          200: jsonResponse(selectionResponse, "Saved worktree choices."),
        },
      }),
      zValidator("json", testSelectionSchema),
      async (c) =>
        c.json({
          selection: await service.setSelection(c.req.param("id"), c.req.valid("json")),
        }),
    )
  if (starts) {
    app
      .post(
        "/work-starts",
        describeRoute({
          operationId: "startWork",
          summary: "Create a managed worktree and work item",
          tags: ["Worktrees"],
          description:
            "Creates or resumes durable worktree creation. Retry with identical requestId and inputs. baseRef and branch must be valid Git references; path must be absolute. Does not prepare containers or establish readiness.",
          requestBody: jsonBody(startWorkInput),
          responses: {
            ...localErrors,
            ...inputErrors,
            ...notFound,
            ...conflict,
            200: jsonResponse(
              startedWorkResponse,
              "Create a managed worktree and work item response.",
            ),
          },
        }),
        zValidator("json", startWorkInput),
        async (c) => c.json(await starts.start(c.req.valid("json")), 200),
      )
      .get(
        "/work-starts/:id",
        describeRoute({
          operationId: "getWorkStart",
          summary: "Read worktree creation state",
          tags: ["Worktrees"],
          description:
            "Returns the durable operation record, including recoverable intermediate states.",
          responses: {
            ...localErrors,
            ...notFound,
            200: jsonResponse(workStartResponse, "Read worktree creation state response."),
          },
        }),
        (c) => c.json(starts.get(c.req.param("id"))),
      )
  }
  return app
    .get(
      "/projects/:id/dependencies",
      describeRoute({
        operationId: "listProjectDependencies",
        summary: "Read the shared project dependency rules",
        tags: ["Settings"],
        description:
          "Reads the primary checkout's common dependency modes and environment override rules. Does not select modes or start containers.",
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          200: jsonResponse(dependenciesResponse, "Shared project dependency catalog."),
          422: jsonResponse(dependenciesResponse, "Invalid project dependency rules."),
        },
      }),
      async (c) => {
        const result = await inspection.projectDependencies(c.req.param("id"))
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .post(
      "/projects",
      describeRoute({
        operationId: "connectProject",
        summary: "Connect a project",
        tags: ["Projects"],
        description:
          "Connects an existing local directory or Git project. Does not copy or modify project settings.",
        requestBody: jsonBody(projectInput),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          201: jsonResponse(projectResponse, "Connect a project response."),
        },
      }),
      zValidator("json", projectInput),
      async (c) => {
        const { path, name } = c.req.valid("json")
        return c.json(await service.connect(path, name), 201)
      },
    )
    .get(
      "/projects",
      describeRoute({
        operationId: "listProjects",
        summary: "List connected projects",
        tags: ["Projects"],
        description: "Returns stored project connections without pagination.",
        responses: {
          ...localErrors,
          200: jsonResponse(z.array(projectResponse), "List connected projects response."),
        },
      }),
      async (c) => c.json(await service.listProjects()),
    )
    .get(
      "/projects/:id",
      describeRoute({
        operationId: "getProject",
        summary: "Read a project",
        tags: ["Projects"],
        description: "Returns the project identity and saved location.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(projectResponse, "Read a project response."),
        },
      }),
      (c) => c.json(service.getProject(c.req.param("id"))),
    )
    .post(
      "/projects/:id/worktrees",
      describeRoute({
        operationId: "resolveWorktreePath",
        summary: "Resolve an existing checkout",
        tags: ["Worktrees"],
        description:
          "The path must resolve to a checkout belonging to the selected project. Does not create a Git worktree or prepare an environment.",
        requestBody: jsonBody(worktreeInput),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          201: jsonResponse(worktreeResponse, "Resolve an existing checkout response."),
        },
      }),
      zValidator("json", worktreeInput),
      async (c) => c.json(await service.ensure(c.req.param("id"), c.req.valid("json").path), 201),
    )
    .get(
      "/projects/:id/worktrees",
      describeRoute({
        operationId: "listWorktrees",
        summary: "List project worktrees",
        tags: ["Worktrees"],
        description:
          "Discovers current Git checkouts or the existing directory project root. No worktree setup is required.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(z.array(worktreeResponse), "List project worktrees response."),
        },
      }),
      async (c) => c.json(await service.listWorktrees(c.req.param("id"))),
    )
    .get(
      "/worktrees/:id",
      describeRoute({
        operationId: "getWorktree",
        summary: "Read a worktree",
        tags: ["Worktrees"],
        description:
          "Returns the retained worktree identity and historical checkout path. Use the project worktree list for current availability.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(worktreeResponse, "Read a worktree response."),
        },
      }),
      (c) => c.json(service.getWorktree(c.req.param("id"))),
    )
    .get(
      "/worktrees/:id/settings",
      describeRoute({
        operationId: "inspectWorktreeSettings",
        summary: "Validate shared settings for a checkout",
        tags: ["Settings"],
        description:
          "Reads the shared project JSON settings against checkout-local Compose inputs and returns validation diagnostics. Validation does not check Docker or service readiness. Invalid settings return the same validation shape with status 422.",
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          ...invalidSettings,
          200: jsonResponse(
            worktreeSettingsResponse,
            "Validate shared settings for a checkout response.",
          ),
          422: jsonResponse(worktreeSettingsResponse, "Settings validation failed; see issues."),
        },
      }),
      async (c) => {
        const result = await inspection.settings(c.req.param("id"))
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .get(
      "/worktrees/:id/git/image",
      describeRoute({
        operationId: "readWorktreeImage",
        summary: "Compare an image from the worktree review baseline with working files",
        tags: ["Git"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          ...conflict,
          200: jsonResponse(
            z.object({ baseRevision: z.string().optional(), before: imageSide, after: imageSide }),
            "Bounded image bytes as data URLs; missing sides are null and read failures are explicit.",
          ),
        },
      }),
      zValidator(
        "query",
        z.object({
          scope: z.enum(["all", "staged", "unstaged"]).optional(),
          path: z
            .string()
            .min(1)
            .max(4096)
            .refine(
              (path) =>
                !path.startsWith("/") &&
                !path.includes("\\") &&
                !path.includes("\0") &&
                !path
                  .split("/")
                  .some(
                    (part) =>
                      !part || part === "." || part === ".." || part.toLowerCase() === ".git",
                  ),
              "Expected a repository-relative image path",
            )
            .regex(/\.(png|jpe?g|svg|gif|webp|avif|bmp|ico)$/i),
        }),
      ),
      async (c) => {
        const result = await inspection.image(c.req.param("id"), c.req.valid("query").path, {
          scope: c.req.valid("query").scope,
        })
        c.header("Cache-Control", "no-store")
        return c.json(result)
      },
    )
    .get(
      "/worktrees/:id/git/diff",
      describeRoute({
        operationId: "readWorktreeDiff",
        summary: "Read worktree changes as a Git patch",
        tags: ["Git"],
        responses: {
          ...localErrors,
          ...notFound,
          ...inputErrors,
          ...conflict,
          200: jsonResponse(
            z.object({
              available: z.boolean(),
              revision: z.string().nullable().optional(),
              baseRevision: z.string().optional(),
              reason: z.string().optional(),
              patch: z.string(),
              omitted: z.array(z.string()),
            }),
            "Read-only bounded patch. Unavailable or omitted content is explicit.",
          ),
        },
      }),
      zValidator(
        "query",
        z.object({ scope: z.enum(["all", "staged", "unstaged"]).default("all") }),
      ),
      async (c) => {
        return c.json(await inspection.diff(c.req.param("id"), c.req.valid("query").scope))
      },
    )
    .get(
      "/worktrees/:id/dependencies",
      describeRoute({
        operationId: "listDependencies",
        summary: "Read dependency choices",
        tags: ["Settings"],
        description:
          "Read-only dependency mode settings and selection planning. Does not resolve secrets or start containers.",

        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          ...inputErrors,
          200: jsonResponse(
            dependenciesResponse,
            "Dependency definitions and optional selected plan.",
          ),
          422: jsonResponse(
            z.union([dependenciesResponse, z.object({ error: z.string() })]),
            "Invalid settings or selection.",
          ),
        },
      }),
      async (c) => {
        const result = await inspection.dependencies(c.req.param("id"))
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .get(
      "/worktrees/:id/dependencies/:dependency",
      describeRoute({
        operationId: "getDependency",
        summary: "Read one dependency definition",
        tags: ["Settings"],
        description:
          "Read-only dependency mode settings and selection planning. Does not resolve secrets or start containers.",

        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          ...inputErrors,
          200: jsonResponse(
            dependenciesResponse,
            "Dependency definitions and optional selected plan.",
          ),
          422: jsonResponse(
            z.union([dependenciesResponse, z.object({ error: z.string() })]),
            "Invalid settings or selection.",
          ),
        },
      }),
      async (c) => {
        const result = await inspection.dependencies(c.req.param("id"), c.req.param("dependency"))
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .post(
      "/worktrees/:id/dependencies/plan",
      describeRoute({
        operationId: "planDependencies",
        summary: "Preview a dependency selection",
        tags: ["Settings"],
        description:
          "Read-only dependency mode settings and selection planning. Does not resolve secrets or start containers.",
        requestBody: jsonBody(testSelectionSchema),
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          ...inputErrors,
          200: jsonResponse(
            dependenciesResponse,
            "Dependency definitions and optional selected plan.",
          ),
          422: jsonResponse(
            z.union([dependenciesResponse, z.object({ error: z.string() })]),
            "Invalid settings or selection.",
          ),
        },
      }),
      zValidator("json", testSelectionSchema),
      async (c) => {
        const result = await inspection.dependencies(
          c.req.param("id"),
          undefined,
          c.req.valid("json"),
        )
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .get(
      "/worktrees/:id/git",
      describeRoute({
        operationId: "inspectWorktreeGit",
        summary: "Inspect worktree Git state",
        tags: ["Git"],
        description:
          "Read-only HEAD/index/worktree inspection. Git unavailability is returned as available: false, not a failed test.",
        responses: {
          ...localErrors,
          ...notFound,
          ...conflict,
          200: jsonResponse(gitResponse, "Inspect worktree Git state response."),
        },
      }),
      async (c) => {
        return c.json(await inspection.git(c.req.param("id")))
      },
    )
}
