import type { Settings, TestSelection } from "./types/settings.js"

export function defaultIntegrationSelection(
  settings: Settings,
  _containers: string[],
): TestSelection {
  return {
    services: settings.services,
    select: Object.fromEntries(
      Object.entries(settings.dependencies).map(([name, value]) => [name, value.kind]),
    ),
  }
}
