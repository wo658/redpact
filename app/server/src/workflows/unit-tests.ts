import { randomUUID } from "node:crypto"
import { problem } from "../core/problems.js"
import type { GitService } from "../core/types/git.js"
import type { ProjectSettingsService } from "../core/types/services.js"
import type { SettingsEditor } from "../core/types/settings-editor.js"
import type {
  UnitCatalog,
  UnitCommand,
  UnitRun,
  UnitRunStore,
  UnitTestFiles,
  UnitTestsService,
} from "../core/types/unit-tests.js"
import { unitTestSettingsSchema } from "../core/unit-test-schema.js"

export function createUnitTests(deps: {
  worktrees: {
    resolve(id: string): Promise<{
      worktree: { id: string; projectId: string; projectRoot: string }
      git: Pick<GitService, "mergeBase">
    }>
  }
  projects: Pick<ProjectSettingsService, "tracking">
  settings: Pick<SettingsEditor, "project">
  files: UnitTestFiles
  command: UnitCommand
  store: UnitRunStore
}): UnitTestsService {
  const active = new Map<string, { abort: AbortController; done: Promise<void> }>()
  const starting = new Set<string>()
  let closing = false
  for (const run of deps.store.list()) {
    if (run.state === "running") {
      deps.store.save({
        ...run,
        state: "finished",
        outcome: run.outcome ?? "interrupted",
        finishedAt: new Date().toISOString(),
        error: run.outcome
          ? run.error
          : "Server stopped before command completion; the command was not rerun",
      })
    }
  }
  function get(id: string) {
    return (
      deps.store.list().find((run) => run.id === id) ??
      problem("not_found", "Unit command run not found")
    )
  }
  async function configured(id: string) {
    const target = await deps.worktrees.resolve(id)
    const document = await deps.settings.project(target.worktree.projectId)
    if (document.issues.length) {
      problem("invalid_input", document.issues.join("\n"))
    }
    const value = document.value?.unitTests
    return { target, settings: value ? unitTestSettingsSchema.parse(value) : null }
  }
  const cleaning = new Map<string, Promise<void>>()
  function cleanup(id: string): Promise<void> {
    const existing = cleaning.get(id)
    if (existing) {
      return existing
    }
    const done = (async () => {
      try {
        await deps.command.stop(get(id))
        deps.store.save({ ...get(id), cleanup: { state: "removed", error: null } })
      } catch (error) {
        deps.store.save({
          ...get(id),
          cleanup: {
            state: "failed",
            error: error instanceof Error ? error.message : "Container cleanup failed",
          },
        })
      }
    })().finally(() => cleaning.delete(id))
    cleaning.set(id, done)
    return done
  }
  const recovery = Promise.all(
    deps.store
      .list()
      .filter((run) => run.cleanup.state !== "removed")
      .map((run) => cleanup(run.id)),
  )
  async function execute(run: UnitRun, signal: AbortSignal) {
    try {
      const result = await deps.command.execute(run, signal, (change) =>
        deps.store.save({ ...get(run.id), ...change }),
      )
      deps.store.save({ ...get(run.id), ...result })
    } catch (error) {
      deps.store.save({
        ...get(run.id),
        outcome: signal.aborted ? "cancelled" : "execution_error",
        error: error instanceof Error ? error.message : "Container command failed",
      })
    } finally {
      await cleanup(run.id)
      deps.store.save({ ...get(run.id), state: "finished", finishedAt: new Date().toISOString() })
      active.delete(run.id)
    }
  }
  return {
    busy: (ids?: string[]) =>
      [...starting].some((id) => !ids || ids.includes(id)) ||
      deps.store
        .list()
        .some(
          (run) =>
            (!ids || ids.includes(run.worktreeId)) &&
            (run.state === "running" || run.cleanup.state !== "removed"),
        ),
    get,
    async inspect(id, scope = "changed") {
      const { target, settings } = await configured(id)
      let catalog: UnitCatalog = { files: [], diagnostics: [] }
      if (settings) {
        try {
          let base: string | null = null
          if (scope === "changed") {
            const tracking = await deps.projects.tracking(target.worktree.projectId)
            base = await target.git.mergeBase(tracking.mainBranch)
          }
          catalog = await deps.files.catalog(
            target.worktree.projectRoot,
            base,
            settings.patterns,
            undefined,
            scope,
          )
        } catch (error) {
          catalog.diagnostics.push(
            error instanceof Error ? error.message : "Git comparison unavailable",
          )
        }
      }
      const runs = deps.store
        .list()
        .filter((run) => run.worktreeId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
      return { settings, catalog, runs }
    },
    async start(id) {
      await recovery
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      if (
        starting.has(id) ||
        deps.store.list().some((run) => run.worktreeId === id && run.state === "running")
      ) {
        problem("worktree_busy", "A unit command is already running in this worktree")
      }
      starting.add(id)
      try {
        const { target, settings } = await configured(id)
        if (!settings) {
          problem("invalid_input", "Configure unitTests in project settings first")
        }
        await deps.files.directory(target.worktree.projectRoot, settings.cwd)
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        const run: UnitRun = {
          version: 2,
          id: randomUUID(),
          worktreeId: id,
          projectId: target.worktree.projectId,
          projectRoot: target.worktree.projectRoot,
          settings,
          runtimeId: null,
          containerId: null,
          imageId: null,
          inputDigest: null,
          cleanup: { state: "pending", error: null },
          createdAt: new Date().toISOString(),
          finishedAt: null,
          state: "running",
          outcome: null,
          exitCode: null,
          stdout: "",
          stderr: "",
          truncated: false,
          error: null,
        }
        deps.store.save(run)
        const abort = new AbortController()
        const task = { abort, done: Promise.resolve() }
        active.set(run.id, task)
        task.done = execute(run, abort.signal)
        return structuredClone(run)
      } finally {
        starting.delete(id)
      }
    },
    async cancel(id) {
      get(id)
      const task = active.get(id)
      task?.abort.abort()
      await task?.done
      await recovery
      if (!task && get(id).cleanup.state !== "removed") {
        await cleanup(id)
      }
      return get(id)
    },
    async close() {
      closing = true
      const tasks = [...active.values()]
      for (const task of tasks) {
        task.abort.abort()
      }
      await Promise.all(tasks.map((task) => task.done))
      await recovery
      await Promise.all(cleaning.values())
    },
  }
}
