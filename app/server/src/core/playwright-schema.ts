import { z } from "zod"
import { settingsSchema, testSelectionSchema } from "./settings-schema.js"
import { resourceLimitSchema } from "./test-resource-schema.js"
export const captureArtifactSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().max(1000),
  contentType: z.enum(["image/png", "video/webm", "application/zip"]),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  viewport: z
    .strictObject({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
})
export const captureCaseSchema = z.strictObject({
  id: z.string().max(1000),
  title: z.string().max(4000),
  file: z.string().max(4096),
  status: z.enum(["passed", "failed", "timedOut", "skipped", "interrupted"]),
  duration: z.number().min(0),
  errors: z.array(z.string().max(65536)).max(100),
  steps: z
    .array(
      z.strictObject({
        title: z.string().max(4000),
        duration: z.number(),
        error: z.string().max(65536).optional(),
      }),
    )
    .max(1000),
  artifacts: z.array(captureArtifactSchema).max(100),
})
const side = z.strictObject({
  resourceLimit: resourceLimitSchema.optional(),
  state: z.enum(["pending", "running", "finished", "unavailable"]),
  root: z.string().optional(),
  environmentId: z.string().uuid().optional(),
  inputDigest: z.string().optional(),
  imageId: z.string().optional(),
  runtimeId: z.string().optional(),
  containerId: z.string().optional(),
  browserVersion: z.string().optional(),
  platform: z.string().optional(),
  outcome: z.string().optional(),
  error: z.string().optional(),
  cases: z.array(captureCaseSchema).max(1000),
})
export const captureRunSchema = z.strictObject({
  version: z.literal(1),
  target: z.string().min(1),
  purpose: z.enum(["capture", "functional"]),
  scope: z.enum(["worktree", "project"]).optional(),
  id: z.string().uuid(),
  worktreeId: z.string(),
  projectId: z.string(),
  projectRoot: z.string(),
  revision: z.string().nullable(),
  baseRevision: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  baseError: z.string().optional(),
  settings: settingsSchema.shape.playwright.unwrap(),
  selection: testSelectionSchema,
  settingsDigest: z.string(),
  sourceDigest: z.string(),
  appDigest: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  state: z.enum(["queued", "running", "finished"]),
  outcome: z.enum(["passed", "failed", "error", "cancelled", "interrupted"]).optional(),
  error: z.string().optional(),
  cleanupError: z.string().optional(),
  before: side,
  after: side,
})
