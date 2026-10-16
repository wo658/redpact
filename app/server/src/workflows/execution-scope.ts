import { selectExecutionFiles } from "../core/execution-selection.js"
import { executionSupportingPaths } from "../core/execution-support.js"
import { problem } from "../core/problems.js"
import type { ExecutionScopeFiles, ExecutionScopeService } from "../core/types/execution-scope.js"
import type { ProjectSettingsService, WorktreeService } from "../core/types/services.js"
export function createExecutionScopes(deps: {
  worktrees: Pick<WorktreeService, "resolve">
  projects: Pick<ProjectSettingsService, "tracking">
  files: ExecutionScopeFiles
}): ExecutionScopeService {
  return {
    async resolve(id, input) {
      const target = await deps.worktrees.resolve(id)
      const result = await target.settings.read()
      if (!result.valid || !result.settings) {
        problem("configuration_error", "Fix shared project settings before selecting tests")
      }
      const settings = result.settings
      const requested = input.executionScope ?? settings.tests.executionScope ?? "all"
      if (input.kind === "unit" && requested === "all" && !settings.unitTests?.fileCommand) {
        return {
          requested,
          resolved: "all",
          baseRevision: null,
          files: [],
          filesExact: false,
          reason: "all_requested",
        }
      }
      const catalog = await deps.files.catalog(target.worktree.projectRoot, settings, input)
      const changes =
        requested === "changed"
          ? await deps.files
              .changes(
                target.worktree.projectRoot,
                (await deps.projects.tracking(target.worktree.projectId)).mainBranch,
              )
              .catch((error: unknown) =>
                problem(
                  "invalid_input",
                  error instanceof Error ? error.message : "Git comparison unavailable",
                ),
              )
          : { baseRevision: null, paths: [] }
      const selected = selectExecutionFiles({
        requested,
        baseRevision: changes.baseRevision,
        files: catalog.files,
        changedPaths: changes.paths,
        supportingPaths: executionSupportingPaths({ ...catalog, changedPaths: changes.paths }),
        ...(input.tests
          ? { explicitFiles: input.tests.map((path) => `${settings.tests.directory}/${path}`) }
          : {}),
      })
      if (!selected.files.length) {
        throw Object.assign(
          new Error("No tests selected; no execution was started and no test pass was recorded"),
          { code: "invalid_input", executionSelection: selected },
        )
      }
      return selected
    },
  }
}
