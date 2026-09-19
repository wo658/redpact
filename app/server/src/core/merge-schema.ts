import { z } from "zod"
export const mergeRequestSchema = z.strictObject({
  requestId: z.uuid(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  targetRevision: z.string().regex(/^[a-f0-9]{64}$/),
})
export const changeRequestSchema = z.strictObject({ revision: z.string().regex(/^[a-f0-9]{64}$/) })
export const commitRequestSchema = changeRequestSchema.extend({
  message: z.string().min(1).max(10000),
})
export const mergeRecordSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  worktreeId: z.string(),
  projectId: z.string(),
  sourceRoot: z.string(),
  sourceBranch: z.string(),
  sourceHead: z.string(),
  targetRoot: z.string(),
  targetBranch: z.string(),
  targetHead: z.string(),
  candidatePath: z.string(),
  mergedHead: z.string().nullable(),
  state: z.enum(["running", "merged", "conflict", "failed", "interrupted"]),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  conflicts: z.array(z.string()),
  output: z.string(),
  error: z.string().nullable(),
  cleanupError: z.string().nullable(),
  resolutionRequest: z.string(),
})
