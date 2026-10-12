import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import {
  publishPullRequestSchema,
  pullRequestInspectionSchema,
  pullRequestSchema,
} from "../../core/pull-request-schema.js"
import type { PullRequestService } from "../../core/types/pull-requests.js"
import {
  conflict,
  inputErrors,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

export function pullRequestRoutes(service: PullRequestService) {
  const errors = { ...conflict, ...inputErrors, ...localErrors, ...notFound }
  return new Hono()
    .get(
      "/instance/github",
      describeRoute({
        operationId: "checkGitHubConnection",
        tags: ["Settings"],
        summary: "Check saved GitHub CLI configuration and return the authenticated account",
        responses: {
          ...errors,
          200: jsonResponse(
            z.object({ login: z.string(), cliPath: z.string() }),
            "Current GitHub login and executable; no credentials.",
          ),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await service.connection())
      },
    )
    .get(
      "/worktrees/:id/pull-request",
      describeRoute({
        operationId: "inspectWorktreePullRequest",
        tags: ["Git"],
        summary: "Inspect GitHub origin, default base branch and existing PR without publishing",
        responses: {
          ...errors,
          200: jsonResponse(
            pullRequestInspectionSchema,
            "Publication target and current source identity.",
          ),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await service.inspect(c.req.param("id")))
      },
    )
    .post(
      "/worktrees/:id/pull-request",
      describeRoute({
        operationId: "publishWorktreePullRequest",
        tags: ["Git"],
        summary: "Push the inspected worktree commit and publish or reuse a GitHub PR",
        description:
          "Requires a clean named branch and unchanged origin/source. Pushes only the inspected SHA without force. Never merges, commits, forks or deletes branches. Retry checks existing open PRs; a failed PR creation can leave the branch pushed.",
        requestBody: jsonBody(publishPullRequestSchema),
        responses: {
          ...errors,
          200: jsonResponse(pullRequestSchema, "Published or existing open PR."),
        },
      }),
      zValidator("json", publishPullRequestSchema),
      async (c) => c.json(await service.publish(c.req.param("id"), c.req.valid("json"))),
    )
}
