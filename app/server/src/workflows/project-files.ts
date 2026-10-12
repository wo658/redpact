import type { ProjectEntry, ProjectFiles } from "../core/types/project-files.js"
import type { ProjectSettingsService } from "../core/types/services.js"

export function createProjectFiles(deps: {
  projects: Pick<ProjectSettingsService, "root">
  read: (root: string, path: string) => Promise<ProjectEntry>
}): ProjectFiles {
  return {
    async read(id, path) {
      return deps.read(await deps.projects.root(id), path)
    },
  }
}
