import { problem } from "../core/problems.js"
import { publicSettings } from "../core/settings.js"
import type { SettingsService, TestSelection } from "../core/types/settings.js"
export async function readDependencies(
  service: SettingsService,
  filter?: { dependency?: string },
  selection?: TestSelection,
) {
  const result = await service.read(selection),
    metadata = publicSettings(result)
  if (!result.valid || !result.settings) {
    return metadata
  }
  const name = filter?.dependency
  if (name && !Object.hasOwn(result.settings.dependencies, name)) {
    problem("not_found", "Dependency settings not found")
  }
  return {
    ...metadata,
    services: result.containers,
    applicationServices: result.settings.applicationServices,
    relationships: result.settings.relationships,
    dependencies: name
      ? { [name]: result.settings.dependencies[name] }
      : result.settings.dependencies,
    ...(result.plan ? { selection, plan: result.plan } : {}),
  }
}
