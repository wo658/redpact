import type { Settings, TestSelection } from "./types/settings.js"

export function defaultIntegrationSelection(
  settings: Settings,
  containers: string[],
): TestSelection {
  const select: Record<string, string> = {}
  const dependencyServices = new Set<string>()
  for (const [name, dependency] of Object.entries(settings.dependencies)) {
    const mode = ["mock", "isolated", "shared-local", "remote"].find((mode) =>
      Object.hasOwn(dependency.modes, mode),
    )
    if (mode) {
      select[name] = mode
    }
    for (const definition of Object.values(dependency.modes)) {
      for (const service of definition.services) {
        dependencyServices.add(service)
      }
    }
  }
  const applications = Object.values(settings.applicationServices ?? {}).flatMap(
    (app) => app.services,
  )
  const services = applications.length
    ? applications
    : containers.filter((name) => !dependencyServices.has(name))
  return { services: [...new Set(services)], select }
}
