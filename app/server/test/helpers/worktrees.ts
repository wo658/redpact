import { preferenceFiles } from "../../src/adapters/settings/preferences.js"
import { createGitService } from "../../src/workflows/git.js"
import { createProjectSettings } from "../../src/workflows/project-settings.js"
import { createWorktrees } from "../../src/workflows/worktrees.js"

export function createTestWorktrees(
  deps: Omit<Parameters<typeof createWorktrees>[0], "gitService" | "projects" | "git"> & {
    git: import("../../src/core/types/git.js").GitAdapter
  },
) {
  const projects = createProjectSettings({ ...deps, preferences: preferenceFiles })
  return {
    ...createWorktrees({
      ...deps,
      projects,
      gitService: (path) => createGitService(path, deps.git),
    }),
    projects,
    getTracking: projects.read,
  }
}
