import { z } from "zod"
export const executionScopeSchema = z.enum(["all", "changed"])
export const executionSelectionSchema = z.strictObject({
  requested: executionScopeSchema,
  resolved: z.enum(["all", "changed", "explicit"]),
  baseRevision: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .nullable(),
  filesExact: z.boolean().optional(),
  files: z.array(z.string().min(1).max(4096)),
  reason: z.enum([
    "all_requested",
    "changed_files",
    "supporting_inputs",
    "no_changed_tests",
    "explicit_files",
  ]),
})
