import type { ComposeModel } from "./types/compose.js"
import type { EnvironmentPlan } from "./types/environment-plan.js"
import type { Settings, SettingsIssue, TestSelection } from "./types/settings.js"
export function hasPort(service: ComposeModel["services"][string] | undefined, port: number) {
  return (
    service?.ports?.some((p) =>
      typeof p === "object"
        ? Number(p.target) === port && (!p.protocol || p.protocol === "tcp")
        : Number(String(p).replace(/\/tcp$/, "")) === port,
    ) ?? false
  )
}
export function planContainers(
  settings: Settings,
  model: ComposeModel,
  _selection?: TestSelection,
): { issues: SettingsIssue[]; plan?: EnvironmentPlan } {
  const issues: SettingsIssue[] = []
  const issue = (code: string, path: string, message: string) =>
    issues.push({ code, path, message })
  const exists = (id: string, path: string) => {
    if (!Object.hasOwn(model.services, id)) {
      issue(
        "unknown_reference",
        path,
        `Unknown Compose service: ${id}. Available: ${Object.keys(model.services).join(", ")}`,
      )
    }
  }
  if (settings.playwright && settings.composeFiles.length) {
    exists(settings.playwright.service, "playwright.service")
  }
  for (const [application, definition] of Object.entries(settings.applicationServices ?? {})) {
    for (const id of definition.services) {
      exists(id, `applicationServices.${application}.services`)
    }
  }
  for (const [id, service] of Object.entries(model.services)) {
    for (const other of Object.keys(service.depends_on ?? {})) {
      exists(other, `compose.services.${id}.depends_on`)
    }
  }
  const visiting = new Set<string>(),
    done = new Set<string>()
  function cycle(id: string) {
    if (visiting.has(id)) {
      issue("lifecycle_cycle", "compose", `Fixed prerequisite cycle at ${id}`)
      return
    }
    if (done.has(id)) {
      return
    }
    visiting.add(id)
    for (const other of Object.keys(model.services[id]?.depends_on ?? {})) {
      cycle(other)
    }
    visiting.delete(id)
    done.add(id)
  }
  Object.keys(model.services).forEach(cycle)
  for (const [dependency, definition] of Object.entries(settings.dependencies)) {
    for (const config of [definition]) {
      const path = `dependencies.${dependency}`
      for (const id of config.services) {
        exists(id, `${path}.services`)
      }
      for (const target of Object.keys(config.env)) {
        exists(target, `${path}.env.${target}`)
      }
    }
  }
  for (const [key, value] of Object.entries(settings.tests.env)) {
    if (typeof value !== "string" && "service" in value) {
      exists(value.service, `tests.env.${key}`)
      if (!hasPort(model.services[value.service], value.port)) {
        issue(
          "unknown_reference",
          `tests.env.${key}`,
          "Test URL requires a declared published TCP port",
        )
      }
    }
  }
  if (issues.length || !settings.composeFiles.length) {
    return { issues }
  }
  const plan: EnvironmentPlan = {
    activeServices: [],
    excludedServices: [],
    bindings: {},
    prerequisites: {},
    reasons: {},
    requiredSecrets: [],
  }
  const active = new Set<string>(),
    secrets = new Set<string>()
  function visit(id: string, reason: string) {
    exists(id, "settings.services")
    if (!Object.hasOwn(model.services, id)) {
      return
    }
    plan.reasons[id] ??= []
    plan.reasons[id].push(reason)
    if (active.has(id)) {
      return
    }
    active.add(id)
    plan.bindings[id] = {}
    plan.prerequisites[id] = { ...model.services[id].depends_on }
    for (const other of Object.keys(plan.prerequisites[id])) {
      visit(other, `${id}: fixed prerequisite`)
    }
  }
  for (const id of settings.services) {
    visit(id, "test target")
  }
  for (const [dependency, definition] of Object.entries(settings.dependencies)) {
    for (const id of definition.services) {
      visit(id, `${dependency}: ${definition.kind}`)
    }
  }
  for (const [dependency, definition] of Object.entries(settings.dependencies)) {
    for (const [target, env] of Object.entries(definition.env)) {
      const path = `dependencies.${dependency}.env.${target}`
      if (!active.has(target)) {
        issue("inactive_target", path, `Environment target ${target} is not selected for execution`)
        continue
      }
      for (const [key, value] of Object.entries(env)) {
        if (Object.hasOwn(plan.bindings[target], key)) {
          issue(
            "binding_conflict",
            `${path}.${key}`,
            `Multiple dependencies write ${target}.${key}`,
          )
          continue
        }
        plan.bindings[target][key] = typeof value === "string" ? { value } : value
        if (typeof value !== "string" && "secret" in value) {
          secrets.add(value.secret)
        }
      }
    }
  }
  for (const [key, value] of Object.entries(settings.tests.env)) {
    if (typeof value !== "string") {
      if ("secret" in value) {
        secrets.add(value.secret)
      } else if (!active.has(value.service)) {
        issue("inactive_target", `tests.env.${key}`, "Test URL must reference an active service")
      }
    }
  }
  // No hidden server-environment interpolation. Selected overrides can replace Compose placeholders.
  for (const id of active) {
    const service = structuredClone(model.services[id])
    const env = service.environment as Record<string, unknown> | undefined
    for (const key of Object.keys(plan.bindings[id])) {
      if (env) {
        delete env[key]
      }
    }
    if (/(?<!\$)\$\{/.test(JSON.stringify(service))) {
      issue(
        "compose_input",
        `compose.services.${id}`,
        "Resolve Compose interpolation in project inputs or override the variable through dependency environment bindings",
      )
    }
  }
  plan.activeServices = [...active].sort()
  plan.excludedServices = Object.keys(model.services)
    .filter((id) => !active.has(id))
    .sort()
  plan.requiredSecrets = [...secrets].sort()
  return { issues, ...(issues.length ? {} : { plan }) }
}
