import { z } from "zod"
import { resourceLimitSchema } from "./test-resource-schema.js"

const localPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.includes(":") &&
      !value.includes("\0") &&
      !value.startsWith("/") &&
      value.split("/").every((part) => part && part !== ".." && part !== "."),
    "Use a normalized project-relative path",
  )
export const unitTestSettingsSchema = z.strictObject({
  dockerfile: localPath,
  cwd: z.union([z.literal("."), localPath]).default("."),
  command: z
    .string()
    .min(1)
    .max(10000)
    .refine((value) => value.trim().length > 0 && !value.includes("\0")),
  patterns: z.array(localPath).min(1).max(30),
})
export const unitRunSchema = z.strictObject({
  version: z.literal(2),
  id: z.uuid(),
  worktreeId: z.string(),
  projectId: z.string(),
  projectRoot: z.string(),
  settings: unitTestSettingsSchema,
  runtimeId: z.string().nullable(),
  containerId: z.string().nullable(),
  imageId: z.string().nullable(),
  inputDigest: z.string().nullable(),
  cleanup: z.strictObject({
    state: z.enum(["pending", "removed", "failed"]),
    error: z.string().nullable(),
  }),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  state: z.enum(["running", "finished"]),
  outcome: z
    .enum(["command_succeeded", "command_failed", "execution_error", "cancelled", "interrupted"])
    .nullable(),
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  resourceLimit: resourceLimitSchema.optional(),
  error: z.string().nullable(),
})
