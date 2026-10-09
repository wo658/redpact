import { z } from "zod"
import { unitTestSettingsSchema } from "./unit-test-schema.js"

export const executionReviewRecordSchema = z
  .strictObject({
    version: z.literal(1),
    id: z.string().uuid(),
    kind: z.enum(["unit", "playwright"]),
    path: z.string(),
    worktreeId: z.string(),
    projectId: z.string(),
    policy: z.literal("ask"),
    state: z.enum(["pending", "starting", "started", "cancelled", "interrupted", "failed"]),
    revision: z.number().int().nonnegative(),
    createdAt: z.string(),
    token: z.string().min(32),
    settingsDigest: z.string(),
    inputDigest: z.string(),
    sourceDigest: z.string().optional(),
    specification: z.union([
      unitTestSettingsSchema,
      z.strictObject({
        target: z.string(),
        purpose: z.enum(["capture", "functional"]),
        viewport: z.object({ width: z.number(), height: z.number() }),
      }),
    ]),
    runId: z.string().optional(),
    error: z.string().optional(),
  })

  .superRefine((record, context) => {
    if ((record.state === "started") !== Boolean(record.runId)) {
      context.addIssue({
        code: "custom",
        path: ["runId"],
        message: "Only started reviews have a linked execution",
      })
    }
    if (record.kind === "unit" && !("command" in record.specification)) {
      context.addIssue({
        code: "custom",
        path: ["specification"],
        message: "Unit review requires a command specification",
      })
    }
    if (
      record.kind === "playwright" &&
      (!("target" in record.specification) || !record.sourceDigest)
    ) {
      context.addIssue({
        code: "custom",
        path: ["specification"],
        message: "Playwright review requires a target and captured source identity",
      })
    }
  })
