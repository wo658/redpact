import { z } from "zod"
import { settingsShape } from "./settings-schema.js"

export const dependencyOverridePath = ".redpact/dependencies.override.json"
export const dependencyOverrideSchema = z.strictObject({
  composeFiles: settingsShape.shape.composeFiles.optional(),
  dependencies: settingsShape.shape.dependencies.optional(),
  applicationServices: settingsShape.shape.applicationServices,
  relationships: settingsShape.shape.relationships,
  testEnv: settingsShape.shape.tests.unwrap().shape.env.optional(),
})

// Replace a named dependency as a whole so removed modes/env do not survive implicitly.
// Compose order remains explicit; unrelated shared entries are inherited.
export function applyDependencyOverrides(
  base: Record<string, unknown>,
  override: z.input<typeof dependencyOverrideSchema>,
): Record<string, unknown> {
  const result = { ...base }
  if (override.composeFiles !== undefined) {
    result.composeFiles = override.composeFiles
  }
  for (const key of ["dependencies", "applicationServices"] as const) {
    if (override[key] !== undefined) {
      result[key] = { ...(base[key] as object | undefined), ...override[key] }
    }
  }
  if (override.relationships !== undefined) {
    result.relationships = override.relationships
  }
  if (override.testEnv !== undefined) {
    const tests = base.tests as { env?: object } | undefined
    result.tests = { ...tests, env: { ...tests?.env, ...override.testEnv } }
  }
  return result
}
