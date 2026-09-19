import { z } from "zod"

export const testResourceSchema = z.strictObject({
  memoryMiB: z.number().int().min(64).max(1048576).default(2048),
  timeoutSeconds: z.number().int().min(1).max(86400).default(600),
})

export const resourceLimitSchema = z.strictObject({
  kind: z.enum(["memory", "time"]),
  source: z.enum(["process_rss", "docker_oom", "wall_clock"]),
  limits: testResourceSchema,
  detectedAt: z.iso.datetime(),
  elapsedMs: z.number().nonnegative(),
  observedMiB: z.number().nonnegative().nullable(),
  termination: z.strictObject({
    target: z.enum(["process_group", "container"]),
    confirmed: z.boolean(),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
  }),
})
