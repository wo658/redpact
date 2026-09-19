import { z } from "zod"
import { inputValue } from "./settings-values.js"
export const environmentPlanSchema = z.strictObject({
  activeServices: z.array(z.string()),
  excludedServices: z.array(z.string()),
  bindings: z.record(
    z.string(),
    z.record(z.string(), z.union([inputValue, z.strictObject({ unset: z.literal(true) })])),
  ),
  prerequisites: z.record(
    z.string(),
    z.record(z.string(), z.strictObject({ condition: z.string() })),
  ),
  reasons: z.record(z.string(), z.array(z.string())),
  requiredSecrets: z.array(z.string()),
})
