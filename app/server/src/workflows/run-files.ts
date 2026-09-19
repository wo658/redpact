import { problem } from "../core/problems.js"
import type { LocalFiles } from "../core/types/local-files.js"
import type { ExecuteTests, SubmissionsService, WorktreeService } from "../core/types/services.js"
import type { TestSelection } from "../core/types/settings.js"

export function createCollectTests(deps: {
  files: LocalFiles
  worktrees: WorktreeService
  submissions: SubmissionsService
  executeTests: ExecuteTests
}) {
  return async (input: { path: string; tests?: string[]; selection?: TestSelection }) => {
    const project = await deps.worktrees.connect(input.path)
    const worktree = await deps.worktrees.ensure(project.id, input.path)
    const selection =
      input.selection ?? (await deps.worktrees.getSelection(worktree.id)) ?? undefined
    const settings = await (await deps.worktrees.settingsForPath(input.path)).read(selection)
    if (!settings.valid || !settings.settings) {
      throw Object.assign(new Error("Project settings are invalid"), {
        code: "settings_invalid",
        validation: settings,
      })
    }
    if (!selection) {
      problem("invalid_input", "Select services and modes for this worktree first")
    }
    const files = await deps.files.readTests(
      input.path,
      settings.settings.tests.directory,
      input.tests,
    )
    const work = await deps.submissions.createWork(
      `Run tests from ${settings.settings.tests.directory}`,
      worktree.id,
    )
    const submission = await deps.submissions.submitForWork(work.id, files)
    return { submission, settings, selection }
  }
}

export function createRunFiles(deps: Parameters<typeof createCollectTests>[0]) {
  const collect = createCollectTests(deps)
  return async (input: Parameters<typeof collect>[0]) => {
    const { submission, selection } = await collect(input)
    return deps.executeTests.start(submission.id, selection)
  }
}

export function createRunWorktreeTests(deps: Parameters<typeof createCollectTests>[0]) {
  const runFiles = createRunFiles(deps)
  return async (worktreeId: string) => {
    const target = await deps.worktrees.resolve(worktreeId)
    const { selection } = await deps.worktrees.getIntegrationDefaults(target.worktree.projectId)
    return runFiles({ path: target.worktree.projectRoot, selection })
  }
}
