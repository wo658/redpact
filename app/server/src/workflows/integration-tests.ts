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
  files: Pick<UnitTestFiles, "catalog">
}): IntegrationTestsService {
  return {
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
        // Filter the literal directory before source limits, without treating it as a glob.
        catalog = await deps.files.catalog(
          target.worktree.projectRoot,
          base,
          ["**/*.ts", "**/*.js", "**/*.json", "**/pnpm-lock.yaml"],
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
