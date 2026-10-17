import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import {
  executionIdentity,
  executionKind,
  executionReadInput,
  runTestsInput,
  verificationPath,
} from "../../core/verification-schema.js"
import {
  listAgentArtifacts,
  observedAgentWorkspace,
  requestAgentSubmission,
  requestAgentTests,
  stopAgentRuntime,
} from "../../workflows/agent-verification.js"
import { getReviewContext } from "../../workflows/chat-context.js"
import { getRunSummary } from "../../workflows/run-summary.js"
import type { Services } from "../../workflows/services.js"
import {
  listExecutions,
  projectContainer,
  readExecution,
  readRunArtifact,
} from "../../workflows/verification.js"

import { conflict, inputErrors, invalidSettings, localErrors, notFound } from "./docs/metadata.js"

const listInput = z.strictObject({
  path: verificationPath,
  kind: executionKind.optional(),
  before: z.string().min(1).max(4096).optional(),
})
function docs(operationId: string, summary: string) {
  return describeRoute({
    operationId,
    summary,
    tags: ["Agent CLI"],
    responses: {
      ...localErrors,
      ...inputErrors,
      ...conflict,
      ...invalidSettings,
      ...notFound,
      200: { description: summary },
      202: { description: "Captured execution request" },
      400: { description: "Invalid input" },
      409: { description: "Admission conflict" },
    },
  })
}
export function agentVerificationRoutes(services: Services) {
  return new Hono()
    .post(
      "/submissions/:id/run",
      docs(
        "requestAgentSubmission",
        "Request execution of the retained submission under the approval policy",
      ),
      zValidator("param", z.strictObject({ id: z.string().uuid() })),
      async (c) => c.json(await requestAgentSubmission(services, c.req.valid("param").id), 202),
    )
    .post("/runtime/stop", docs("stopAgentRuntime", "Request orderly runtime shutdown"), (c) =>
      c.json(stopAgentRuntime(services), 202),
    )
    .post(
      "/tests",
      docs("requestAgentTests", "Request managed verification under the captured approval policy"),
      zValidator("json", runTestsInput),
      async (c) => c.json(await requestAgentTests(services, c.req.valid("json")), 202),
    )
    .get(
      "/workspace",
      docs("resolveAgentWorkspace", "Read an existing observed checkout binding"),
      zValidator("query", z.strictObject({ path: verificationPath })),
      async (c) => c.json(await observedAgentWorkspace(services, c.req.valid("query").path)),
    )
    .post(
      "/environment",
      docs("controlAgentEnvironment", "Inspect or control only the selected manual environment"),
      zValidator(
        "json",
        z.strictObject({
          path: verificationPath,
          action: z.enum(["inspect", "start", "restart", "stop"]),
        }),
      ),
      async (c) => {
        const { path, action } = c.req.valid("json")
        return c.json(await projectContainer(services, path, action))
      },
    )
    .get(
      "/runs",
      docs("listAgentRuns", "Read bounded retained execution history"),
      zValidator("query", listInput),
      async (c) => {
        const { path, kind, before } = c.req.valid("query")
        return c.json(await listExecutions(services, path, before, kind))
      },
    )
    .get(
      "/runs/:kind/:id",
      docs("getAgentRun", "Read bounded execution state, verdict and cleanup"),
      zValidator("param", executionIdentity),
      (c) => c.json(getRunSummary(services, c.req.valid("param"))),
    )
    .get(
      "/runs/:kind/:id/context",
      docs("getAgentRunContext", "Read captured review context"),
      zValidator("param", executionIdentity),
      (c) => c.json(getReviewContext(services, c.req.valid("param"))),
    )
    .get(
      "/runs/:kind/:id/logs",
      docs("getAgentRunLogs", "Read bounded execution logs"),
      zValidator("param", executionIdentity),
      async (c) =>
        c.json(
          await readExecution(services, { ...c.req.valid("param"), detail: "log", side: "after" }),
        ),
    )
    .get(
      "/runs/:kind/:id/source",
      docs("getAgentRunSource", "Read captured execution source"),
      zValidator("param", executionIdentity),
      async (c) => {
        const input = executionReadInput.safeParse({
          ...c.req.valid("param"),
          detail: "source",
          sourcePath: c.req.query("sourcePath"),
        })
        if (!input.success) {
          return c.json({ error: "Invalid captured source request" }, 400)
        }
        return c.json(await readExecution(services, input.data))
      },
    )
    .get(
      "/runs/:kind/:id/artifacts",
      docs("listAgentRunArtifacts", "List owned artifacts with pagination"),
      zValidator("param", executionIdentity),
      zValidator("query", z.strictObject({ before: z.string().regex(/^\d+$/).optional() })),
      (c) =>
        c.json(
          listAgentArtifacts(
            services,
            c.req.valid("param"),
            Number(c.req.valid("query").before ?? 0),
          ),
        ),
    )
    .get(
      "/runs/:kind/:id/artifacts/:artifactId",
      docs("getAgentRunArtifact", "Read one owned execution artifact"),
      zValidator(
        "param",
        executionIdentity.extend({ kind: z.literal("playwright"), artifactId: z.string().uuid() }),
      ),
      zValidator("query", z.strictObject({ side: z.enum(["before", "after"]).default("after") })),
      async (c) => {
        const result = await readRunArtifact(services, {
          ...c.req.valid("param"),
          ...c.req.valid("query"),
        })
        c.header("Content-Type", result.artifact.contentType)
        c.header("Cache-Control", "no-store")
        return c.body(new Uint8Array(result.data))
      },
    )
}
