import { hasReviewCaptures, reviewContentFromChanges } from "../core/review-content.js"
import { settingsSchema } from "../core/settings-schema.js"
import type { CaptureRun, PlaywrightFile, PlaywrightSettings } from "../core/types/playwright.js"
import type { ReviewContentService } from "../core/types/review-content.js"
import type { ProjectSettingsService, WorktreeService } from "../core/types/services.js"
import type { SettingsEditor } from "../core/types/settings-editor.js"

// Navigation reads paths and retained metadata, never execution inputs or source bodies.
export function createReviewContent(deps: {
  worktrees: Pick<WorktreeService, "resolve">
  projects: Pick<ProjectSettingsService, "tracking">
  settings: Pick<SettingsEditor, "project">
  changedPaths(root: string, base: string): Promise<string[]>
  discover(root: string, settings: PlaywrightSettings): Promise<PlaywrightFile[]>
  captures(id: string): CaptureRun[]
  unitExists(id: string): boolean
  integrationActive(id: string): boolean
  logExists(id: string): boolean
  environmentExists(id: string): boolean
}): ReviewContentService {
  return {
    async inspect(id) {
      const target = await deps.worktrees.resolve(id)
      let value = {
        preview: false,
        unit: deps.unitExists(id),
        tests: deps.integrationActive(id),
        log: deps.logExists(id),
        environment: deps.environmentExists(id),
      }
      const runs = deps.captures(id)
      value.preview = runs.some((run) => run.state !== "finished" || Boolean(run.cleanupError))
      const document = await deps.settings.project(target.worktree.projectId)
      const parsed = settingsSchema.safeParse(document.value ?? {})
      if (document.issues.length || !parsed.success) {
        return { ...value, preview: true, unit: true, tests: true }
      }
      const settings = parsed.data
      let paths: string[]
      try {
        const tracking = await deps.projects.tracking(target.worktree.projectId)
        const base = await target.git.mergeBase(tracking.mainBranch)
        paths = await deps.changedPaths(target.worktree.projectRoot, base)
      } catch {
        return {
          ...value,
          preview: Boolean(settings.playwright) || value.preview,
          unit: Boolean(settings.unitTests) || value.unit,
          tests: true,
        }
      }
      value = reviewContentFromChanges(value, paths, settings)
      if (settings.playwright && !value.preview) {
        try {
          const files = await deps.discover(target.worktree.projectRoot, settings.playwright)
          value.preview = hasReviewCaptures(files, paths, settings.playwright)
        } catch {
          value.preview = true
        }
      }
      return value
    },
  }
}
