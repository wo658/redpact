import type { z } from "zod"
import type { resourceLimitSchema, testResourceSchema } from "../test-resource-schema.js"

export type TestResources = z.infer<typeof testResourceSchema>
export type ReadTestResources = () => Promise<TestResources>

export type ResourceLimit = z.infer<typeof resourceLimitSchema>
