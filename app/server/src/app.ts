import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { describeRoute } from "hono-openapi"
import { approvalPolicyRoutes } from "./interfaces/http/approval-policy.js"
import { directoryPickerRoutes } from "./interfaces/http/directory-picker.js"
import {
  conflict,
  invalidSettings,
  jsonResponse,
  localErrors,
} from "./interfaces/http/docs/metadata.js"
import { documentationRoutes } from "./interfaces/http/docs/routes.js"
import {
  gitResponse,
  healthResponse,
  settingsResponse,
  settingsSpecificationResponse,
} from "./interfaces/http/docs/schemas.js"
import { environmentRoutes } from "./interfaces/http/environments.js"
import { eventRoutes } from "./interfaces/http/events.js"
import { integrationTestRoutes } from "./interfaces/http/integration-tests.js"
import { mergeRoutes } from "./interfaces/http/merges.js"
import { playwrightRoutes } from "./interfaces/http/playwright.js"
import { projectFileRoutes } from "./interfaces/http/project-files.js"
import { projectGraphRoutes } from "./interfaces/http/project-graph.js"
import { projectSecretRoutes } from "./interfaces/http/project-secrets.js"
import { projectSettingsRoutes } from "./interfaces/http/project-settings.js"
import { pullRequestRoutes } from "./interfaces/http/pull-requests.js"
import { reviewContentRoutes } from "./interfaces/http/review-content.js"
import { runRoutes } from "./interfaces/http/runs.js"
import { settingsEditorRoutes } from "./interfaces/http/settings-editor.js"
import { submissionRoutes } from "./interfaces/http/submissions.js"
import { testContainerRoutes } from "./interfaces/http/test-container.js"
import { uiRoutes } from "./interfaces/http/ui.js"
import { unitTestRoutes } from "./interfaces/http/unit-tests.js"
import { updateRoutes } from "./interfaces/http/updates.js"
import { worktreeRoutes } from "./interfaces/http/worktrees.js"
import { mcpRoutes } from "./interfaces/mcp/routes.js"
import { createDefaultInspection } from "./workflows/inspection.js"
import type { Services } from "./workflows/services.js"
export function createApp(services: Services, options: { uiDirectory?: string } = {}) {
  const inspection = createDefaultInspection(services)
  const app = new Hono()
  app.use(secureHeaders())
  app.use(async (c, next) => {
    const url = new URL(c.req.url)
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      return c.json({ error: "Invalid local host" }, 403)
    }
    const origin = c.req.header("Origin")
    if (origin && origin !== url.origin) {
      return c.json({ error: "Origin is not allowed" }, 403)
    }
    const site = c.req.header("Sec-Fetch-Site")
    if (site && site !== "same-origin" && site !== "none") {
      return c.json({ error: "Cross-site browser requests are not allowed" }, 403)
    }
    await next()
  })
  app.route("/", documentationRoutes(app))
  app.use(
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  )
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse()
    }
    const code = "code" in error ? error.code : undefined
    if (code === "work_start_incomplete") {
      return c.json(
        { code, error: error.message, recovery: "recovery" in error ? error.recovery : undefined },
        409,
      )
    }
    if (code === "work_start_conflict") {
      return c.json({ code, error: error.message }, 409)
    }
    if (code === "settings_invalid") {
      return c.json(
        {
          error: error.message,
          validation: (error as unknown as { validation: unknown }).validation,
        },
        422,
      )
    }
    if (code === "settings_unsupported") {
      return c.json({ error: error.message }, 422)
    }
    if (
      [
        "environment_conflict",
        "environment_error",
        "project_mismatch",
        "worktree_unavailable",
        "worktree_busy",
        "target_required",
      ].includes(String(code))
    ) {
      return c.json({ code, error: error.message }, 409)
    }
    if (code === "directory_picker_busy") {
      return c.json({ code, error: error.message }, 409)
    }
    if (code === "directory_picker_unavailable") {
      return c.json({ code, error: error.message }, 503)
    }
    if (code === "directory_picker_failed") {
      return c.json({ code, error: error.message }, 502)
    }
    if (code === "not_found") {
      return c.json({ error: error.message }, 404)
    }
    if (code === "git_fetch_failed") {
      return c.json({ code, error: error.message }, 502)
    }
    if (code === "graph_changed") {
      return c.json({ code, error: error.message }, 409)
    }
    if (code === "invalid_input") {
      return c.json({ error: error.message }, 400)
    }
    if (code === "closing") {
      return c.json({ error: error.message }, 503)
    }
    return c.json({ error: "Internal server error" }, 500)
  })
  if (services.updates) {
    app.route("/api", updateRoutes(services.updates))
  }
  if (services.reviewContent) {
    app.route("/api", reviewContentRoutes(services.reviewContent))
  }
  if (services.testContainer) {
    app.route("/api/projects", testContainerRoutes(services.testContainer))
  }
  if (services.projectSecrets) {
    app.route("/api", projectSecretRoutes(services.projectSecrets))
  }
  if (services.captures && services.captureWorkflow) {
    app.route(
      "/api",
      playwrightRoutes(services.captures, services.captureWorkflow, services.playwrightCatalog),
    )
  }
  app.route("/api", directoryPickerRoutes(services.directoryPicker))
  if (services.integrationTests) {
    app.route("/api", integrationTestRoutes(services.integrationTests, services.runWorktreeTests))
  }
  if (services.pullRequests) {
    app.route("/api", pullRequestRoutes(services.pullRequests))
  }
  if (services.merges) {
    app.route("/api", mergeRoutes(services.merges))
  }
  if (services.unitTests) {
    app.route("/api", unitTestRoutes(services.unitTests))
  }
  if (services.settingsEditor) {
    app.route("/api", settingsEditorRoutes(services.settingsEditor))
  }
  if (services.projectFiles) {
    app.route("/api", projectFileRoutes(services.projectFiles))
  }
  if (services.projectGraph) {
    app.route("/api", projectGraphRoutes(services.projectGraph))
  }
  if (services.projectSettings) {
    app.route("/api", projectSettingsRoutes(services.projectSettings))
  }
  if (services.reviews) {
    app.route("/api", approvalPolicyRoutes(services.reviews))
  }
  if (services.changes && services.dataDirectory) {
    app.route("/api", eventRoutes(services))
  }
  if (services.environments && services.stopEnvironment) {
    app.route(
      "/api/environments",
      environmentRoutes(services.environments, services.stopEnvironment),
    )
  }
  if (services.worktrees) {
    app.route("/api", worktreeRoutes(services.worktrees, services.workStarts))
  }
  return app
    .get(
      "/api/settings/schema",
      describeRoute({
        operationId: "describeSettings",
        summary: "Read the settings specification",
        tags: ["Settings"],
        description:
          "Returns shared JSON Schema, examples, and the agent configuration workflow. Does not read or write project settings.",
        responses: {
          ...localErrors,
          200: jsonResponse(
            settingsSpecificationResponse,
            "Read the settings specification response.",
          ),
        },
      }),
      (c) => c.json(inspection.specification()),
    )
    .get(
      "/api/settings",
      describeRoute({
        operationId: "inspectDefaultSettings",
        summary: "Validate default worktree settings",
        tags: ["Settings"],
        description:
          "Requires --project when using worktree routing. Invalid or missing settings return validation diagnostics with status 422. This does not establish runtime readiness.",
        responses: {
          ...localErrors,
          ...conflict,
          ...invalidSettings,
          200: jsonResponse(settingsResponse, "Validate default worktree settings response."),
          422: jsonResponse(settingsResponse, "Settings validation failed; see issues."),
        },
      }),
      async (c) => {
        const result = await inspection.settings()
        return c.json(result, result.valid ? 200 : 422)
      },
    )
    .get(
      "/api/git",
      describeRoute({
        operationId: "inspectDefaultGit",
        summary: "Inspect default worktree Git state",
        tags: ["Git"],
        description:
          "Requires --project when using worktree routing. Returns available: false when Git inspection is unavailable.",
        responses: {
          ...localErrors,
          ...conflict,
          200: jsonResponse(gitResponse, "Inspect default worktree Git state response."),
        },
      }),
      async (c) => {
        return c.json(await inspection.git())
      },
    )
    .get(
      "/api/health",
      describeRoute({
        operationId: "getHealth",
        summary: "Read service health",
        tags: ["Server"],
        description:
          "Reports server availability and whether the Git adapter is connected. Does not check Docker or project settings.",
        responses: {
          ...localErrors,
          200: jsonResponse(healthResponse, "Read service health response."),
        },
      }),
      (c) => c.json(inspection.health()),
    )
    .route("/api", submissionRoutes(services.submissions))
    .route("/api/runs", runRoutes(services.runs, services.executeTests))
    .route("/mcp", mcpRoutes(services))
    .route("/", uiRoutes(options.uiDirectory))
}
export type AppType = ReturnType<typeof createApp>
