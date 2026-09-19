import type { z } from "zod"
import type { environmentPlanSchema } from "../environment-plan-schema.js"
export type EnvironmentPlan = z.infer<typeof environmentPlanSchema>
