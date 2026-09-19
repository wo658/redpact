import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import type { ExecuteTests, RunQueries } from "../../core/types/services.js"
import { runInput } from "../schemas.js"
import {
  conflict,
  inputErrors,
  invalidSettings,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"
import { runResponse } from "./docs/schemas.js"
export function runRoutes(runs: RunQueries, executeTests: ExecuteTests) {
  return new Hono()
    .get(
      "/",
      describeRoute({
        operationId: "listRuns",
        summary: "List runs for a selected parent",
        tags: ["Runs"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  state: z.string(),
                  createdAt: z.string(),
                  finishedAt: z.string().nullable(),
                  kind: z.enum(["integration", "unit", "playwright"]).optional(),
                  submissionId: z.string().optional(),
                  intent: z.string().optional(),
                  outcome: z.string().nullable().optional(),
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
        z.union([
          z
            .object({ submissionId: z.string().min(1), before: z.string().min(1).optional() })
            .strict(),
          z
            .object({ worktreeId: z.string().min(1), before: z.string().min(1).optional() })
            .strict(),
        ]),
      ),
      (c) => {
        const query = c.req.valid("query")
        if ("worktreeId" in query) {
          return c.json(runs.listForWorktree(query.worktreeId, query.before))
        }
        return c.json(runs.list(query.submissionId, query.before))
      },
    )
    .get(
      "/executions/:kind/:id/copy",
      describeRoute({
        operationId: "copyExecutionLog",
        summary: "Read recorded execution text for copying",
        tags: ["Runs"],
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          200: jsonResponse(
            z.object({ text: z.string() }),
            "Recorded metadata and diagnostics; missing and truncated output are explicit.",
          ),
        },
      }),
      zValidator(
        "param",
        z.object({ kind: z.enum(["integration", "unit", "playwright"]), id: z.string().min(1) }),
      ),
      async (c) => {
        const { kind, id } = c.req.valid("param")
        c.header("Cache-Control", "no-store")
        return c.json(await runs.copyLog(kind, id))
      },
    )
    .get(
      "/:id/logs",
      describeRoute({
        operationId: "getRunLogs",
        summary: "Read persisted execution output",
        tags: ["Runs"],
        description:
          "Returns the first 256 KiB of each recorded stream. Null means no file has been recorded; output is saved when the runner process completes.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(
            z.object({
              stdout: z.object({ text: z.string(), truncated: z.boolean() }).nullable(),
              stderr: z.object({ text: z.string(), truncated: z.boolean() }).nullable(),
            }),
            "Recorded stdout and stderr.",
          ),
        },
      }),
      async (c) => c.json(await runs.logs(c.req.param("id"))),
    )
    .post(
      "/",
      describeRoute({
        operationId: "startRun",
        summary: "Start a test run",
        tags: ["Runs"],
        description:
          "Validates the submission settings and queues Vitest execution. Each execution prepares a fresh temporary environment using saved worktree choices and removes it after execution. Acceptance is not a passing result.",
        requestBody: jsonBody(runInput),
        responses: {
          ...localErrors,
          ...inputErrors,
          ...notFound,
          ...conflict,
          ...invalidSettings,
          202: jsonResponse(runResponse, "Start a test run response."),
        },
      }),
      zValidator("json", runInput),
      async (c) => c.json(await executeTests.start(c.req.valid("json").submissionId), 202),
    )
    .get(
      "/:id",
      describeRoute({
        operationId: "getRun",
        summary: "Read a test run",
        tags: ["Runs"],
        description:
          "Returns the current run, scenario evidence, limitations, and environment summary when available.",
        responses: {
          ...localErrors,
          ...notFound,
          200: jsonResponse(runResponse, "Read a test run response."),
        },
      }),
      (c) => c.json(runs.get(c.req.param("id"))),
    )
    .post(
      "/:id/cancel",
      describeRoute({
        operationId: "cancelRun",
        summary: "Cancel a test run",
        tags: ["Runs"],
        description:
          "Requests cancellation and returns current state. Cleanup follows the accepted retention policy; terminal runs retain their verdict.",
        responses: {
          ...localErrors,
          ...notFound,
          202: jsonResponse(runResponse, "Cancel a test run response."),
        },
      }),
      (c) => c.json(executeTests.cancel(c.req.param("id")), 202),
    )
}
