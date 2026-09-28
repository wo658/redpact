import type { ComposeModel } from "./types/compose.js"
import type { EnvironmentPlan } from "./types/environment-plan.js"
import type { Settings, SettingsIssue, TestSelection } from "./types/settings.js"
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
    plan.prerequisites[id] = Object.fromEntries(
      Object.entries(model.services[id].depends_on ?? {}).map(([name, edge]) => [
        name,
        { condition: edge.condition ?? "service_started" },
      ]),
    )
    for (const other of Object.keys(plan.prerequisites[id])) {
      if (Object.hasOwn(model.services, other)) {
        visit(other, `${id}: fixed prerequisite`)
      }
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
  plan.activeServices = [...active].sort()
  plan.excludedServices = Object.keys(model.services)
    .filter((id) => !active.has(id))
    .sort()
  plan.requiredSecrets = [...secrets].sort()
  return { issues, ...(issues.length ? {} : { plan }) }
}
