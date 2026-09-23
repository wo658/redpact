import { isAbsolute, join, relative } from "node:path"
import type { ProjectRecord } from "../core/types/contracts.js"
import type { LocalFiles } from "../core/types/local-files.js"
import type { SubmissionsService, WorktreeService } from "../core/types/services.js"
import type { Settings } from "../core/types/settings.js"
import { stableTestInputs } from "./observe-test-inputs.js"

function contains(root: string, path: string) {
  const part = relative(root, path)
  return !isAbsolute(part) && part !== ".." && !part.startsWith("../")
}
function overlaps(roots: string[], changed: string[]) {
  return changed.some((change) =>
    roots.some((root) => contains(root, change) || contains(change, root)),
  )
}
function changedCheckouts(roots: string[], changed: string[]) {
  const affected = new Set<string>()
  const deepest = [...roots].sort((a, b) => b.length - a.length)
  for (const path of changed) {
    const owner = deepest.find((root) => contains(root, path))
    if (owner) {
      affected.add(owner)
    }
    for (const root of roots) {
      if (contains(path, root)) {
        affected.add(root)
      }
    }
  }
  return affected
}
function sharedInputsChanged(project: ProjectRecord, settingsPaths: string[], changed?: string[]) {
  return (
    !changed ||
    changed.some(
      (change) =>
        (project.location.kind === "git" && contains(project.location.commonGitdir, change)) ||
        overlaps(settingsPaths, [change]),
    )
  )
}

export function createObserveProjects(deps: {
  files: LocalFiles
  worktrees: WorktreeService
  submissions: SubmissionsService
  checkouts(commonGitdir: string): Promise<string[]>
}) {
  const previous = new Map<
    string,
    {
      watchPaths: string[]
      issues: { path: string; message: string }[]
      inputs: Map<string, string[]>
    }
  >()
  async function collect(
    worktreeId: string,
    root: string,
    tracked: Map<string, string[]>,
    knownInputs?: string[],
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted()
    const service = (await deps.worktrees.resolve(worktreeId)).settings
    signal?.throwIfAborted()
    function track(settings?: Settings) {
      const previousInputs = tracked.get(root) ?? knownInputs
      const sourcePaths = settings
        ? [
            join(root, settings.tests.directory),
            ...(settings.composeFiles ?? []).map((file) => join(root, file)),
          ]
        : (previousInputs?.slice(1) ?? [join(root, "tests")])
      tracked.set(root, [join(service.rulesRoot ?? root, ".redpact/settings.json"), ...sourcePaths])
    }
    const settings = await service.read()
    signal?.throwIfAborted()
    track(settings.settings)
    if (!settings.valid || !settings.settings) {
      return {
        path: root,
        message: "Project settings are missing or invalid; use configure validate",
      }
    }
    if (settings.settings.unitTests && settings.settings.composeFiles.length === 0) {
      return
    }
    const files = await deps.files.readTests(root, settings.settings.tests.directory)
    signal?.throwIfAborted()
    const latest = deps.submissions.latest(worktreeId)
    if (latest && JSON.stringify(latest.files) === JSON.stringify(files)) {
      return
    }
    const inputs = await stableTestInputs(
      { settings: settings.settings, files },
      async () => {
        signal?.throwIfAborted()
        const current = await service.read()
        signal?.throwIfAborted()
        track(current.settings)
        if (!current.valid || !current.settings) {
          throw new Error("Project settings are missing or invalid; use configure validate")
        }
        return {
          settings: current.settings,
          files: await deps.files.readTests(root, current.settings.tests.directory),
        }
      },
      signal,
    )
    signal?.throwIfAborted()
    await deps.submissions.submitObserved(
      `Tests observed in ${inputs.settings.tests.directory}`,
      worktreeId,
      inputs.files,
    )
  }
  async function observeProject(path: string, changed?: string[], signal?: AbortSignal) {
    const retained = previous.get(path)
    const watchPaths = new Set<string>([path])
    const issues: { path: string; message: string }[] = []
    const inputs = new Map<string, string[]>()
    try {
      const project = await deps.worktrees.connect(path)
      signal?.throwIfAborted()
      let roots = [path]
      if (project.location.kind === "git") {
        const location = project.location
        watchPaths.add(location.commonGitdir)
        roots = (await deps.checkouts(location.commonGitdir)).map((root) =>
          join(root, location.projectPath),
        )
      }
      const settingsPaths = [...(retained?.inputs.values() ?? [])].map((inputs) => inputs[0])
      const shared = sharedInputsChanged(project, settingsPaths, changed)
      const affected = changedCheckouts(roots, changed ?? [])
      for (const root of roots) {
        signal?.throwIfAborted()
        watchPaths.add(root)
        try {
          const worktree = await deps.worktrees.ensure(project.id, root)
          if (worktree.gitdir) {
            watchPaths.add(worktree.gitdir)
          }
          const knownInputs = retained?.inputs.get(root)
          const relevant = affected.has(root) && overlaps(knownInputs ?? [], changed ?? [])
          if (retained && knownInputs && !shared && changed && !relevant) {
            inputs.set(root, knownInputs)
            issues.push(...retained.issues.filter((issue) => issue.path === root))
            continue
          }
          const issue = await collect(worktree.id, root, inputs, knownInputs, signal)
          if (issue) {
            issues.push(issue)
          }
        } catch (error) {
          signal?.throwIfAborted()
          issues.push({
            path: root,
            message: error instanceof Error ? error.message : "Cannot observe tests",
          })
        }
      }
    } catch (error) {
      signal?.throwIfAborted()
      if ((error as { code?: string }).code === "project_disconnected") {
        return { watchPaths: [], issues: [], inputs }
      }
      issues.push({
        path,
        message: error instanceof Error ? error.message : "Cannot discover project",
      })
    }
    return { watchPaths: [...watchPaths], issues, inputs }
  }
  return async (paths: string[], changed?: string[], signal?: AbortSignal) => {
    signal?.throwIfAborted()
    for (const path of previous.keys()) {
      if (!paths.includes(path)) {
        previous.delete(path)
      }
    }
    const watchPaths = new Set<string>()
    const issues: { path: string; message: string }[] = []
    for (const path of paths) {
      signal?.throwIfAborted()
      const retained = previous.get(path)
      let result = retained
      if (!retained || !changed || overlaps(retained.watchPaths, changed)) {
        result = await observeProject(path, changed, signal)
        previous.set(path, result)
      }
      if (result) {
        for (const root of result.watchPaths) {
          watchPaths.add(root)
        }
        issues.push(...result.issues)
      }
    }
    return { watchPaths: [...watchPaths], issues }
  }
}
