import type { ProjectTracking } from "./contracts.js"
import type { TestSelection } from "./settings.js"

export type PreferenceFiles = {
  integrationDefaults(root: string): Promise<TestSelection | null>
  saveIntegrationDefaults(root: string, value: TestSelection): Promise<void>
  tracking(root: string, previous?: ProjectTracking): Promise<ProjectTracking | null>
  saveTracking(root: string, value: ProjectTracking): Promise<void>
  selection(root: string, previous?: TestSelection): Promise<TestSelection | null>
  saveSelection(root: string, value: TestSelection): Promise<void>
}
