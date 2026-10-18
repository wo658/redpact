import { preferenceFiles } from "../../src/adapters/settings/preferences.js"
import { createGitService } from "../../src/workflows/git.js"
import { createProjectSettings } from "../../src/workflows/project-settings.js"
import { createWorkStartQueries } from "../../src/workflows/work-starts.js"
import { createWorktrees } from "../../src/workflows/worktrees.js"

export function createTestWorktrees(
  deps: Omit<Parameters<typeof createWorktrees>[0], "gitService" | "projects" | "git"> & {
    git: import("../../src/core/types/git.js").GitAdapter
  },
) {
  const projects = createProjectSettings({ ...deps, preferences: preferenceFiles })
  const worktrees = createWorktrees({
    activity: deps.activity,
    projects,
    store: deps.store,
    git: deps.git,
    gitService: (path) => createGitService(path, deps.git),
    settings: deps.settings,
  })
  const workStarts = createWorkStartQueries(deps.store)
  return {
    ...worktrees,
    projects,
    getTracking: projects.read,
    setTracking: projects.update,
    workStarts,
    getWorkStart: workStarts.get,
  }
}
