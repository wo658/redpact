import { z } from "zod"

export const trackingSchema = z
  .strictObject({
    mainBranch: z.string().min(1).max(1024).nullable(),
    hideMerged: z.boolean(),
    showBranches: z.boolean().optional(),
  })
  .refine((value) => !value.hideMerged || value.mainBranch !== null, {
    message: "Choose a main branch before hiding merged worktrees",
    path: ["mainBranch"],
  })
