import { problem } from "../core/problems.js"
import type {
  PlaywrightCatalog,
  PlaywrightFile,
  PlaywrightReviewCatalog,
  PlaywrightSettings,
} from "../core/types/playwright.js"
import type { ProjectSettingsService, WorktreeService } from "../core/types/services.js"

export function createPlaywrightCatalog(deps: {
  projects: Pick<ProjectSettingsService, "root" | "tracking">
  worktrees: Pick<WorktreeService, "projectSettings" | "resolve">
  discover(root: string, settings: PlaywrightSettings): Promise<PlaywrightFile[]>
  changedPaths(root: string, base: string): Promise<string[]>
  read(root: string, path: string): Promise<string>
}): PlaywrightCatalog {
  async function inspect(projectId: string) {
    const root = await deps.projects.root(projectId)
    const result = await (await deps.worktrees.projectSettings(projectId)).read()
    if (!result.valid) {
      problem("invalid_input", result.issues.map((issue) => issue.message).join("\n"))
    }
    const settings = result.settings?.playwright ?? null
    return {
      root,
      settings,
      files: settings
        ? (await deps.discover(root, settings)).filter((file) => file.scope !== "worktree")
        : [],
    }
  }
  return {
    inspect,
    async worktree(worktreeId) {
      const target = await deps.worktrees.resolve(worktreeId)
      const result = await target.settings.read()
      if (!result.valid) {
        problem("invalid_input", result.issues.map((issue) => issue.message).join("\n"))
      }
      const review: PlaywrightReviewCatalog = { files: [], diagnostics: [] }
      const settings = result.settings?.playwright
      if (!settings) {
        return review
      }
      const root = target.worktree.projectRoot
      const files = await deps.discover(root, settings)
      review.files = files.filter((file) => file.scope === "worktree")
      try {
        const tracking = await deps.projects.tracking(target.worktree.projectId)
        const base = await target.git.mergeBase(tracking.mainBranch)
        const changed = new Set(await deps.changedPaths(root, base))
        review.baseRevision = base
        review.files = files.filter(
          (file) => file.scope === "worktree" || changed.has(`${settings.directory}/${file.path}`),
        )
      } catch (error) {
        review.diagnostics.push(
          error instanceof Error ? error.message : "Git comparison unavailable",
        )
      }
      return review
    },
    async source(projectId, path) {
      const catalog = await inspect(projectId)
      if (!catalog.settings || !catalog.files.some((file) => file.path === path)) {
        problem("not_found", "Playwright source not found in the declared targets")
      }
      return deps.read(catalog.root, `${catalog.settings.directory}/${path}`)
    },
  }
}
