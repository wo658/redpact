import type { ProjectTracking } from "./contracts.js"

export type PreferenceFiles = {
  tracking(root: string, previous?: ProjectTracking): Promise<ProjectTracking | null>
  saveTracking(root: string, value: ProjectTracking): Promise<void>
}
