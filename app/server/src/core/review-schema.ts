import { z } from "zod"
import { testSelectionSchema } from "./settings-schema.js"

export const approvalPolicySchema = z.enum(["auto", "ask"])
export const reviewRecordSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  path: z.string(),
  submissionId: z.string().uuid(),
  settingsDigest: z.string(),
  selection: testSelectionSchema,
  policy: approvalPolicySchema,
  state: z.enum(["pending", "starting", "started", "cancelled", "interrupted", "failed"]),
  revision: z.number().int().nonnegative(),
  environmentApproved: z.boolean(),
  testsApproved: z.boolean(),
  runId: z.string().uuid().optional(),
  error: z.string().optional(),
  token: z.string().min(32),
  createdAt: z.string(),
  dependencies: z.record(z.string(), z.array(z.string())),
})
