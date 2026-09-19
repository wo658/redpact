import { z } from "zod"
import { connectionValue, inputValue } from "./settings-values.js"
// Captured adapter inputs; never exposed as an authoring schema.
export const executionSettingsSchema = z.strictObject({
  environment: z.strictObject({
    compose: z.strictObject({
      files: z.array(z.string()),
      profiles: z.array(z.string()).default([]),
    }),
    variables: z.record(z.string(), inputValue).default({}),
    timeoutMs: z.number().default(120000),
    stopTimeoutMs: z.number().default(30000),
  }),
  tests: z.strictObject({
    timeoutMs: z.number().default(10000),
    env: z.record(z.string(), z.union([inputValue, connectionValue])).default({}),
  }),
})
