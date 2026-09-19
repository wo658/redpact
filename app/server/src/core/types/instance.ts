import type { z } from "zod"
import type { instanceSchema, instanceSettingsSchema } from "../instance-schema.js"

export type Instance = z.infer<typeof instanceSchema>
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>
