import { isAbsolute } from "node:path"
import { z } from "zod"
import { testResourceSchema } from "./test-resource-schema.js"

export const serverPortSchema = z.number().int().min(0).max(65535)

export const instanceSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.iso.datetime(),
})

export const instanceSettingsSchema = z.strictObject({
  testResources: testResourceSchema.optional(),
  environmentConcurrency: z.number().int().min(1).max(4).optional(),
  github: z
    .strictObject({
      cliPath: z
        .string()
        .min(1)
        .max(4096)
        .refine(isAbsolute, "Use an absolute GitHub CLI path")
        .optional(),
    })
    .optional(),
  approval: z.enum(["auto", "ask"]).optional(),
  projects: z
    .array(z.string().min(1).max(4096).refine(isAbsolute, "Use an absolute project directory"))
    .max(100)
    .optional(),
  server: z.strictObject({ port: serverPortSchema.default(54318) }).default({ port: 54318 }),
})
