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

// Migration 002 resolves only immutable execution snapshots, never current project/server values.
export function migrateFlatEnvironmentValues(
  source: string,
  id: string,
  values: Record<string, string>,
): string {
  const record = envelope.parse(JSON.parse(source))
  if (record.data.id !== id) {
    throw new Error("Mismatched environment record ID")
  }
  let changed = false
  function bindings(input: unknown, raw: boolean) {
    const result = object.parse(input ?? {})
    for (const [key, binding] of Object.entries(result)) {
      if (binding && typeof binding === "object" && "secret" in binding) {
        const reference = z.strictObject({ secret: z.string() }).parse(binding)
        if (!Object.hasOwn(values, reference.secret)) {
          throw new Error(`Missing captured environment value: ${reference.secret}`)
        }
        result[key] = values[reference.secret]
        changed = true
      } else if (binding && typeof binding === "object" && "service" in binding) {
        const endpoint = z
          .strictObject({
            service: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
            port: z.number().int().min(1).max(65535),
            scheme: z.enum(["http", "https"]).optional(),
            value: z.enum(["host", "port", "url"]).optional(),
          })
          .parse(binding)
        const host = `${endpoint.service}.redpact.test`
        if (endpoint.value === "host") {
          result[key] = host
        } else if (endpoint.value === "port") {
          result[key] = String(endpoint.port)
        } else {
          result[key] = `${endpoint.scheme ?? "http"}://${host}:${endpoint.port}`
        }
        changed = true
      } else if (!raw && binding && typeof binding === "object" && "value" in binding) {
        result[key] = z.strictObject({ value: z.string().max(10000) }).parse(binding).value
        changed = true
      }
    }
    return result
  }
  const specification = object.parse(record.data.specification)
  const dependencies = object.parse(specification.dependencies ?? {})
  for (const definition of Object.values(dependencies)) {
    const dependency = object.parse(definition)
    const env = object.parse(dependency.env ?? {})
    for (const service of Object.keys(env)) {
      env[service] = bindings(env[service], true)
    }
    Object.assign(definition as object, { env })
  }
  specification.dependencies = dependencies
  const tests = object.parse(specification.tests ?? {})
  tests.env = bindings(tests.env, true)
  specification.tests = tests
  record.data.specification = specification
  const settings = object.parse(record.data.settings)
  const runtime = object.parse(settings.environment)
  runtime.variables = bindings(runtime.variables, false)
  settings.environment = runtime
  const runner = object.parse(settings.tests)
  runner.env = bindings(runner.env, false)
  settings.tests = runner
  record.data.settings = settings
  const plan = object.parse(record.data.plan)
  const mapped = object.parse(plan.bindings)
  for (const service of Object.keys(mapped)) {
    mapped[service] = bindings(mapped[service], false)
  }
  plan.bindings = mapped
  if (Object.hasOwn(plan, "requiredSecrets")) {
    delete plan.requiredSecrets
    changed = true
  }
  record.data.plan = plan
  return changed ? `${JSON.stringify(record, null, 2)}\n` : source
}
