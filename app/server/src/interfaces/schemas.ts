import { z } from "zod"
export const workInput = z.object({
  intent: z.string().trim().min(1).max(10000),
  worktreeId: z.string().uuid().optional(),
})
export const submissionInput = z.object({
  files: z
    .array(z.object({ path: z.string().max(240), source: z.string().max(200000) }))
    .min(1)
    .max(50),
})
export const runInput = z.strictObject({
  submissionId: z.string().uuid(),
})
export const idInput = z.object({ id: z.string().uuid() })

export const projectInput = z.strictObject({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(200).optional(),
})
export const worktreeInput = z.strictObject({ path: z.string().min(1).max(4096) })
