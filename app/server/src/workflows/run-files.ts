import { problem } from "../core/problems.js"
import type { ExecutionScopeService } from "../core/types/execution-scope.js"
import type { ExecutionScope } from "../core/types/execution-selection.js"
import type { LocalFiles } from "../core/types/local-files.js"
import type { ExecuteTests, SubmissionsService, WorktreeService } from "../core/types/services.js"
import type { TestSelection } from "../core/types/settings.js"

export function createCollectTests(deps: {
  files: LocalFiles
  worktrees: WorktreeService
  submissions: SubmissionsService
  executionScopes?: ExecutionScopeService
  executeTests: ExecuteTests
}) {
  return async (input: {
    path: string
    tests?: string[]
    selection?: TestSelection
    executionScope?: ExecutionScope
  }) => {
    const project = await deps.worktrees.connect(input.path)
    const worktree = await deps.worktrees.ensure(project.id, input.path)
    const selection = (await deps.worktrees.getSelection(worktree.id)) ?? undefined
    const settings = await (await deps.worktrees.settingsForPath(input.path)).read(selection)
    if (!settings.valid || !settings.settings) {
      throw Object.assign(new Error("Project settings are invalid"), {
        code: "settings_invalid",
        validation: settings,
      })
    }
    if (!selection) {
      problem(
        "invalid_input",
        "Configure fixed root services in shared settings.json before execution",
      )
    }
    const executionSelection = await deps.executionScopes?.resolve(worktree.id, {
      kind: "integration",
      executionScope: input.executionScope,
      tests: input.tests,
    })
    const selectedTests =
      executionSelection?.files.map((path) =>
        path.slice(settings.settings!.tests.directory.length + 1),
      ) ?? input.tests
    const files = await deps.files.readTests(
      input.path,
      settings.settings.tests.directory,
      selectedTests,
    )
    const work = await deps.submissions.createWork(
      `Run tests from ${settings.settings.tests.directory}`,
      worktree.id,
    )
    const submission = await deps.submissions.submitForWork(work.id, files, executionSelection)
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
  return async (worktreeId: string, executionScope?: ExecutionScope) => {
    const target = await deps.worktrees.resolve(worktreeId)
    const { selection } = await deps.worktrees.getIntegrationDefaults(target.worktree.projectId)
    return runFiles({ path: target.worktree.projectRoot, selection, executionScope })
  }
}

export async function collectExistingSubmission(
  deps: Pick<Parameters<typeof createCollectTests>[0], "worktrees" | "submissions">,
  id: string,
) {
  const submission = deps.submissions.get(id)
  if (!submission.worktreeId || !submission.projectRoot) {
    problem("worktree_unavailable", "Submission has no execution checkout identity")
  }
  const target = await deps.worktrees.resolve(submission.worktreeId)
  if (target.worktree.projectRoot !== submission.projectRoot) {
    problem("project_mismatch", "Submission checkout identity changed")
  }
  const selection = await deps.worktrees.getSelection(submission.worktreeId)
  if (!selection) {
    problem("configuration_error", "Configure fixed root services before execution")
  }
  const settings = await target.settings.read(selection)
  if (!settings.valid || !settings.settings) {
    problem("configuration_error", "Submission checkout settings are invalid")
  }
  return { submission, settings, selection }
}
