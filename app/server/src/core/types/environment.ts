import type { z } from "zod"
import type { environmentSchema } from "../environment-schema.js"
export type Environment = z.infer<typeof environmentSchema>
export type EnvironmentObservation = Pick<Environment, "resources" | "endpoints"> & {
  healthy: boolean
  runtimeId: string
}
export type EnvironmentAdapter = {
  fingerprint(root: string, inputs: Pick<Environment, "settings" | "plan">): Promise<string>
  prepare(
    record: Environment,
    signal: AbortSignal,
    observe: (change: Partial<Environment>) => void,
  ): Promise<void>
  inspect(record: Environment): Promise<EnvironmentObservation>
  stop(record: Environment): Promise<void>
}
