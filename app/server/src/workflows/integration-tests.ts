import { problem } from "../core/problems.js"
import { settingsSchema } from "../core/settings-schema.js"
import type { IntegrationTestsService } from "../core/types/integration-tests.js"
import type { ProjectSettingsService, WorktreeService } from "../core/types/services.js"
import type { SettingsEditor } from "../core/types/settings-editor.js"
import type { UnitCatalog, UnitTestFiles } from "../core/types/unit-tests.js"

export function createIntegrationTests(deps: {
  worktrees: Pick<WorktreeService, "resolve">
  projects: Pick<ProjectSettingsService, "tracking">
  settings: Pick<SettingsEditor, "project">
  files: Pick<UnitTestFiles, "catalog" | "source">
}): IntegrationTestsService {
  const patterns = ["**/*.ts", "**/*.js", "**/*.json", "**/pnpm-lock.yaml"]
  return {
    async source(id, path) {
      const target = await deps.worktrees.resolve(id)
      const document = await deps.settings.project(target.worktree.projectId)
      if (document.issues.length) {
        problem("invalid_input", document.issues.join("\n"))
      }
      const directory = settingsSchema.parse(document.value ?? {}).tests.directory
      return deps.files.source(target.worktree.projectRoot, path, patterns, directory)
    },
    async inspect(id, scope = "changed") {
      const target = await deps.worktrees.resolve(id)
      const document = await deps.settings.project(target.worktree.projectId)
      if (document.issues.length) {
        problem("invalid_input", document.issues.join("\n"))
      }
      const directory = settingsSchema.parse(document.value ?? {}).tests.directory
      let catalog: UnitCatalog = { files: [], diagnostics: [] }
      try {
        let base: string | null = null
        if (scope === "changed") {
          const tracking = await deps.projects.tracking(target.worktree.projectId)
          base = await target.git.mergeBase(tracking.mainBranch)
        }
        // The configured directory is literal, not a glob.
        catalog = await deps.files.catalog(
          target.worktree.projectRoot,
          base,
          patterns,
          directory,
          scope,
        )
      } catch (error) {
        catalog.diagnostics.push(
          error instanceof Error ? error.message : "Git comparison unavailable",
        )
      }
      return { directory, catalog }
    },
  }
}
