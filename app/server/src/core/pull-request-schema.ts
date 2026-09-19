import { z } from "zod"

export const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().url(),
})
export const publishPullRequestSchema = z
  .object({
    revision: z.string().min(1).max(256),
    repository: z.string().min(1).max(256),
    baseBranch: z.string().min(1).max(1024),
    branch: z.string().min(1).max(1024),
    head: z.string().regex(/^[a-f0-9]{40,64}$/),
    pushUrl: z.string().min(1).max(2048),
    title: z.string().trim().min(1).max(256),
    body: z.string().max(60000),
  })
  .strict()
export const pullRequestInspectionSchema = publishPullRequestSchema.omit({ body: true }).extend({
  existing: pullRequestSchema.nullable(),
})
