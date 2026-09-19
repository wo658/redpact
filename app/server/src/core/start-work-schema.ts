import { isAbsolute } from "node:path"
import { z } from "zod"

export const startWorkInput = z.strictObject({
  requestId: z.string().uuid(),
  projectId: z.string().uuid(),
  intent: z.string().trim().min(1).max(10000),
  baseRef: z
    .string()
    .min(1)
    .max(1024)
    .refine((v) => !v.startsWith("-") && !v.includes("\0")),
  branch: z
    .string()
    .min(1)
    .max(240)
    .refine((v) => !v.startsWith("-") && !v.includes("\0")),
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((v) => isAbsolute(v) && !v.includes("\0")),
})
