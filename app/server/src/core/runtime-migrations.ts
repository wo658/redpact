import { z } from "zod"
import { environmentSchema } from "./environment-schema.js"

const object = z.record(z.string(), z.unknown())
const envelope = z.strictObject({ version: z.literal(1), data: object })
// Frozen input contract for migration 001; do not reuse a changing authoring schema.
const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const legacyDependency = z.strictObject({
  description: z.string().optional(),
  modes: z.record(name, object),
  recommendation: z.unknown().optional(),
  assessments: z.unknown().optional(),
})

// Only the captured selection is authoritative; recommendations cannot fill missing evidence.
export function migrateEnvironmentSettings(source: string, id: string): string {
  const record = envelope.parse(JSON.parse(source))
  if (record.data.id !== id) {
    throw new Error("Mismatched environment record ID")
  }
  const specification = object.parse(record.data.specification)
  const dependencies = object.parse(specification.dependencies ?? {})
  const selection = object.parse(record.data.selection)
  const selected = object.parse(selection.select)
  let changed = false
  for (const [key, value] of Object.entries(dependencies)) {
    const dependency = object.parse(value)
    if (!Object.hasOwn(dependency, "modes")) {
      continue
    }
    const legacy = legacyDependency.parse(value)
    const kind = selected[key]
    if (typeof kind !== "string" || !Object.hasOwn(legacy.modes, kind)) {
      throw new Error(`Missing captured dependency selection: ${key}`)
    }
    const definition = { ...legacy.modes[kind], kind }
    if (legacy.description !== undefined) {
      Object.assign(definition, { description: legacy.description })
    }
    dependencies[key] = definition
    changed = true
  }
  if (!changed) {
    return source
  }
  specification.dependencies = dependencies
  specification.services ??= selection.services
  record.data.specification = specification
  // Preserve original timestamps, digests, captured source and resolved runtime inputs.
  return `${JSON.stringify(record, null, 2)}\n`
}

// Validate only after all pending version-specific transforms have been planned.
export function validateCurrentEnvironmentRecord(source: string) {
  z.strictObject({ version: z.literal(1), data: environmentSchema }).parse(JSON.parse(source))
}

export function validateMigrationHistory(history: unknown, names: string[]): string[] {
  const parsed = z.array(z.string()).safeParse(history)
  if (!parsed.success || parsed.data.some((name, index) => name !== names[index])) {
    throw new Error(
      "Unsupported runtime migration history; use a matching newer Redpact version or restore a complete backup",
    )
  }
  return parsed.data
}
