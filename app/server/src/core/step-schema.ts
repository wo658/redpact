import { z } from "zod"

export const stepResultSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  state: z.enum(["passed", "failed", "interrupted"]),
  startedAt: z.number().finite().nonnegative(),
  durationMs: z.number().finite().nonnegative().optional(),
})
