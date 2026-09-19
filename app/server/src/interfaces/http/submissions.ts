import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { SubmissionsService } from "../../core/types/services.js"
import { submissionInput, workInput } from "../schemas.js"
import {
  conflict,
  inputErrors,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"
import { submissionResponse, workResponse } from "./docs/schemas.js"
export function submissionRoutes(submissions: SubmissionsService) {
  return new Hono()
    .get(
      "/submissions",
      describeRoute({
        operationId: "listSubmissions",
        summary: "List submissions for a selected parent",
        tags: ["Submissions"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  workItemId: z.string(),
                  digest: z.string(),
                  intent: z.string(),
                  createdAt: z.string(),
                }),
              ),
              nextCursor: z.string().nullable(),
            }),
            "Newest first, at most 20 items; before is an opaque record cursor.",
          ),
        },
      }),
      zValidator(
        "query",
        z.object({ worktreeId: z.string().min(1), before: z.string().min(1).optional() }),
      ),
      (c) => {
        const query = c.req.valid("query")
        return c.json(submissions.list(query.worktreeId, query.before))
      },
    )
    .post(
      "/work-items",
      describeRoute({
        operationId: "createWorkItem",
        summary: "Create a work item",
        tags: ["Work items"],
        description:
          "Creates development intent in the selected worktree; worktreeId may be omitted only with a startup default.",
        requestBody: jsonBody(workInput),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...conflict,
          201: jsonResponse(workResponse, "Create a work item response."),
        },
      }),
      zValidator("json", workInput),
      async (c) => {
        const { intent, worktreeId } = c.req.valid("json")
        return c.json(await submissions.createWork(intent, worktreeId), 201)
      },
    )
    .get(
      "/work-items/:id",
      describeRoute({
        operationId: "getWorkItem",
        summary: "Read a work item",
        tags: ["Work items"],
        description: "Returns saved intent and worktree identity.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(workResponse, "Read a work item response."),
        },
      }),
      (c) => c.json(submissions.getWork(c.req.param("id"))),
    )
    .get(
      "/work-items",
      describeRoute({
        operationId: "listWorkItems",
        summary: "List work items for a project",
        tags: ["Work items"],
        description:
          "Filters persisted work items by projectId, without pagination. Omitting projectId returns an empty list.",
        parameters: [
          {
            name: "projectId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Connected project ID.",
          },
        ],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...conflict,
          200: jsonResponse(z.array(workResponse), "List work items for a project response."),
        },
      }),
      (c) => c.json(submissions.listWork(c.req.query("projectId") ?? "")),
    )
    .post(
      "/work-items/:id/submissions",
      describeRoute({
        operationId: "createSubmission",
        summary: "Submit immutable test sources",
        tags: ["Submissions"],
        description:
          "Preserves source files and static review. This does not run tests or establish human approval. Paths must be relative .ts, .js, or .json files; package manifests follow the test dependency policy.",
        requestBody: jsonBody(submissionInput),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          201: jsonResponse(submissionResponse, "Submit immutable test sources response."),
        },
      }),
      zValidator("json", submissionInput),
      async (c) =>
        c.json(await submissions.submitForWork(c.req.param("id"), c.req.valid("json").files), 201),
    )
    .get(
      "/submissions/:id",
      describeRoute({
        operationId: "getSubmission",
        summary: "Read a submission",
        tags: ["Submissions"],
        description:
          "Returns the immutable source bundle and parsed scenarios/assertions. Static assertions are not runtime evidence.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(submissionResponse, "Read a submission response."),
        },
      }),
      (c) => c.json(submissions.get(c.req.param("id"))),
    )
}
