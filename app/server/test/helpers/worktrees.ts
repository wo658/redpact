import { initializeSettings } from "../../src/adapters/settings/initialize.js"
import { preferenceFiles } from "../../src/adapters/settings/preferences.js"
import type { WorktreeAdapter } from "../../src/core/types/start-work.js"
import { createGitService } from "../../src/workflows/git.js"
import { createProjectSettings } from "../../src/workflows/project-settings.js"
import { createWorkStarts } from "../../src/workflows/start-work.js"
import { createWorktrees } from "../../src/workflows/worktrees.js"

export function createTestWorktrees(
  deps: Omit<
    Parameters<typeof createWorktrees>[0],
    "gitService" | "projects" | "git" | "preferences" | "initializeSettings"
  > & {
    git: import("../../src/core/types/git.js").GitAdapter
    worktrees?: WorktreeAdapter
  },
) {
  const projects = createProjectSettings({ ...deps, preferences: preferenceFiles })
  const worktrees = createWorktrees({
    initializeSettings,
    projects,
    preferences: preferenceFiles,
    store: deps.store,
    git: deps.git,
    gitService: (path) => createGitService(path, deps.git),
    settings: deps.settings,
  })
  const workStarts = createWorkStarts({ store: deps.store, git: deps.worktrees, worktrees })
  return {
    ...worktrees,
    projects,
    getTracking: projects.read,
    setTracking: projects.update,
    workStarts,
    startWork: workStarts.start,
    getWorkStart: workStarts.get,
  }
}
