import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import {
  changeRequestSchema,
  commitRequestSchema,
  mergeRecordSchema,
  mergeRequestSchema,
} from "../../core/merge-schema.js"
import type { MergeService } from "../../core/types/merge.js"
import {
  conflict,
  inputErrors,
  jsonBody,
  jsonResponse,
  localErrors,
  notFound,
} from "./docs/metadata.js"

const diff = z.object({
  available: z.boolean(),
  patch: z.string(),
  omitted: z.array(z.string()),
  reason: z.string().optional(),
})
const snapshot = z.object({
  root: z.string(),
  commonGitdir: z.string(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  revision: z.string(),
  dirty: z.boolean(),
  blockedReason: z.string().nullable(),
  files: z.array(
    z.object({
      path: z.string(),
      staged: z.boolean(),
      unstaged: z.boolean(),
      untracked: z.boolean(),
    }),
  ),
  staged: diff,
  unstaged: diff,
})
const errors = { ...conflict, ...inputErrors, ...localErrors, ...notFound }
export function mergeRoutes(service: MergeService) {
  return new Hono()
    .get(
      "/worktrees/:id/merge",
      describeRoute({
        operationId: "inspectWorktreeMerge",
        summary: "Inspect uncommitted changes, merge target and history",
        tags: ["Git"],
        responses: {
          ...errors,
          200: jsonResponse(
            z.object({
              source: snapshot,
              target: snapshot.nullable(),
              targetBranch: z.string().nullable(),
              blockedReason: z.string().nullable(),
              records: z.array(mergeRecordSchema),
            }),
            "Current changes and retained merge attempts.",
          ),
        },
      }),
      async (c) => {
        c.header("Cache-Control", "no-store")
        return c.json(await service.inspect(c.req.param("id")))
      },
    )
    .post(
      "/worktrees/:id/git/commit",
      describeRoute({
        operationId: "commitWorktreeChanges",
        summary: "Commit all inspected uncommitted files",
        tags: ["Git"],
        requestBody: jsonBody(commitRequestSchema),
        responses: {
          ...errors,
          200: jsonResponse(snapshot, "Git state after commit; does not merge."),
        },
      }),
      zValidator("json", commitRequestSchema),
      async (c) => {
        const input = c.req.valid("json")
        return c.json(await service.commit(c.req.param("id"), input.revision, input.message))
      },
    )
    .post(
      "/worktrees/:id/git/discard",
      describeRoute({
        operationId: "discardWorktreeChanges",
        summary: "Discard all inspected changes including untracked files",
        tags: ["Git"],
        requestBody: jsonBody(changeRequestSchema),
        responses: {
          ...errors,
          200: jsonResponse(
            snapshot,
            "Git state after explicit destructive confirmation; ignored files are preserved.",
          ),
        },
      }),
      zValidator("json", changeRequestSchema),
      async (c) => c.json(await service.discard(c.req.param("id"), c.req.valid("json").revision)),
    )
    .post(
      "/worktrees/:id/merge",
      describeRoute({
        operationId: "mergeWorktree",
        summary: "Merge clean worktree into the configured checked-out main branch",
        tags: ["Git"],
        requestBody: jsonBody(mergeRequestSchema),
        description:
          "Inspects an isolated merge candidate, preserves branches on conflicts, and retains Git evidence. Does not execute tests, push or grant human review approval. Repeat the same request ID to retrieve its recorded result.",
        responses: {
          ...errors,
          200: jsonResponse(
            mergeRecordSchema,
            "Inspect state for merge outcome; conflicts and failures are recorded results.",
          ),
        },
      }),
      zValidator("json", mergeRequestSchema),
      async (c) => c.json(await service.merge(c.req.param("id"), c.req.valid("json"))),
    )
}
