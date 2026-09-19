import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { problem } from "../core/problems.js"
import type {
  CaptureBaselineCleanup,
  CaptureRun,
  CaptureRunner,
  CaptureService,
  CaptureSide,
  CaptureWorkflow,
} from "../core/types/playwright.js"
import type {
  EnvironmentService,
  StopEnvironment,
  WorktreeService,
} from "../core/types/services.js"
import type { TestSelection } from "../core/types/settings.js"
export function createCaptureWorkflow(deps: {
  captures: CaptureService
  runner: CaptureRunner
  baseline: CaptureBaselineCleanup
  worktrees: WorktreeService
  environments: EnvironmentService
  stopEnvironment: StopEnvironment
}): CaptureWorkflow {
  const active = new Map<string, { controller: AbortController; task: Promise<void> }>()
  let closing = false
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const save = (run: CaptureRun) => deps.captures.save(run)
  async function stopSide(run: CaptureRun, side: "before" | "after") {
    await deps.runner.stop(run, side)
    const id = run[side].environmentId
    if (id) {
      deps.environments.finish(id, run.id)
      await deps.stopEnvironment(id)
      await deps.stopEnvironment.idle?.()
      const env = deps.environments.get(id)
      if (env.state !== "stopped") {
        throw new Error(`Environment cleanup: ${env.state}`)
      }
    }
  }
  async function cleanup(run: CaptureRun) {
    const errors: string[] = []
    for (const side of ["after", "before"] as const) {
      try {
        await stopSide(run, side)
      } catch (e) {
        errors.push(message(e))
      }
    }
    if (!errors.length) {
      try {
        await deps.baseline.remove(run)
        await deps.runner.removeInputs(run.id)
      } catch (e) {
        errors.push(message(e))
      }
    }
    run.cleanupError = errors.length ? errors.join("\n") : undefined
    save(run)
  }
  async function side(run: CaptureRun, which: "before" | "after", signal: AbortSignal) {
    const result = run[which]
    const observe = (patch: Partial<CaptureSide>) => {
      Object.assign(result, patch)
      save(run)
    }
    observe({ state: "running" })
    const root = run.projectRoot
    observe({ root })
    const targetId = run.worktreeId
    signal.throwIfAborted()
    const target = await deps.worktrees.resolve(targetId)
    const settings = await target.settings.read(run.selection)
    if (
      !settings.valid ||
      !settings.digest ||
      (which === "after" && settings.digest !== run.settingsDigest)
    ) {
      problem("configuration_error", "Settings changed after execution acceptance")
    }
    const env = await deps.environments.prepare(
      targetId,
      randomUUID(),
      settings.digest,
      run.selection,
      run.id,
    )
    observe({ environmentId: env.id })
    while (deps.environments.get(env.id).state === "preparing") {
      await delay(50, undefined, { signal })
    }
    signal.throwIfAborted()
    const prepared = deps.environments.get(env.id)
    if (prepared.state !== "ready") {
      throw new Error(`Application preparation ${prepared.state}: ${prepared.errors.join("; ")}`)
    }
    const reserved = await deps.worktrees.exclusive(() =>
      deps.environments.reserve(env.id, targetId, run.id, settings.digest!),
    )
    observe({ inputDigest: reserved.inputDigest })
    if (which === "after" && reserved.inputDigest !== run.appDigest) {
      throw new Error("Application sources changed after capture acceptance; run again")
    }
    const evidence = await deps.runner.execute(run, which, reserved, signal, observe)
    observe(evidence)
    signal.throwIfAborted()
    if (!(await deps.environments.healthy(env.id))) {
      throw new Error("Application environment became unhealthy during capture")
    }
    observe({ ...evidence, state: "finished" })
  }
  async function execute(run: CaptureRun, signal: AbortSignal) {
    run.state = "running"
    save(run)
    try {
      await side(run, "after", signal)
      run.outcome = run.after.outcome === "passed" ? "passed" : "failed"
    } catch (e) {
      const limited = run.after.resourceLimit ?? run.before.resourceLimit
      run.outcome = signal.aborted && !limited ? "cancelled" : "error"
      run.error = message(e)
      if (run.after.state !== "finished") {
        run.after.state = "unavailable"
        run.after.error = message(e)
      }
    } finally {
      await cleanup(run)
      run.state = "finished"
      run.finishedAt = new Date().toISOString()
      save(run)
    }
  }
  async function cancel(id: string) {
    const running = active.get(id)
    if (running) {
      running.controller.abort()
      await running.task
    } else {
      await cleanup(deps.captures.get(id))
    }
    return deps.captures.get(id)
  }
  return {
    async cleanupWorktree(worktreeId) {
      await deps.worktrees.exclusive(async () => {
        const target = await deps.worktrees.resolve(worktreeId)
        const runs = deps.captures.list(worktreeId)
        if (runs.some((run) => run.state !== "finished" || run.cleanupError)) {
          problem("worktree_busy", "Finish Playwright execution and resource cleanup first")
        }
        const run = runs.find(
          (run) => run.scope === "worktree" && run.projectRoot === target.worktree.projectRoot,
        )
        if (!run) {
          problem("invalid_input", "Record worktree Playwright sources before cleanup")
        }
        const current = await target.settings.read()
        if (!current.valid || current.settings?.playwright?.directory !== run.settings.directory) {
          problem("invalid_input", "Playwright directory changed since recording")
        }
        await deps.runner.cleanupWorktree(run)
      })
    },
    async inspect(worktreeId) {
      const target = await deps.worktrees.resolve(worktreeId)
      const runs = deps.captures.list(worktreeId)
      const selection = (await deps.worktrees.getSelection(worktreeId)) ?? runs[0]?.selection
      const result = await target.settings.read(selection)
      let inputDigest: string | undefined
      let error = result.valid ? undefined : result.issues.map((issue) => issue.message).join("\n")
      if (result.valid && result.digest && selection) {
        try {
          inputDigest = await deps.environments.fingerprint(worktreeId, selection, result.digest)
        } catch (cause) {
          error = message(cause)
        }
      }
      return {
        inputDigest,
        settings: result.settings?.playwright ?? null,
        runs,
        ...(error ? { error } : {}),
      }
    },
    async start(
      worktreeId,
      selection?: TestSelection,
      viewport?: { width: number; height: number },
      targetName?: string,
    ) {
      const run = await deps.worktrees.exclusive(async () => {
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        if (deps.captures.list(worktreeId).some((r) => r.state !== "finished" || r.cleanupError)) {
          problem("worktree_busy", "A capture is active or needs cleanup")
        }
        const target = await deps.worktrees.resolve(worktreeId)
        const selected =
          selection ??
          (await deps.worktrees.getSelection(worktreeId)) ??
          problem("invalid_input", "Choose application services and dependency modes")
        const result = await target.settings.read(selected)
        const configuration = result.settings?.playwright
        const settings = configuration
          ? { ...configuration, viewport: viewport ?? configuration.viewport }
          : undefined
        if (!result.valid || !result.digest || !settings) {
          problem(
            "invalid_input",
            "Configure playwright in the shared project settings before execution",
          )
        }
        const names = Object.keys(settings.targets)
        const selectedTarget = targetName ?? (names.length === 1 ? names[0] : undefined)
        const targetSettings = selectedTarget ? settings.targets[selectedTarget] : undefined
        if (!selectedTarget || !targetSettings) {
          problem("invalid_input", "Choose a declared Playwright target")
        }
        if (result.plan && !result.plan.activeServices.some((s) => s === settings.service)) {
          problem("invalid_input", "Playwright target service is not selected")
        }
        const git = await target.git.inspect()
        const id = randomUUID()
        const appDigest = await deps.environments.fingerprint(worktreeId, selected, result.digest)
        const sourceDigest = await deps.runner.captureSources(
          id,
          target.worktree.projectRoot,
          settings,
        )
        const value: CaptureRun = {
          version: 1,
          target: selectedTarget,
          purpose: targetSettings.purpose,
          scope: targetSettings.scope,
          id,
          worktreeId,
          projectId: target.worktree.projectId,
          projectRoot: target.worktree.projectRoot,
          revision: git.available ? git.revision : null,
          settings,
          selection: selected,
          settingsDigest: result.digest,
          sourceDigest,
          appDigest,
          createdAt: new Date().toISOString(),
          state: "queued",
          before: { state: "unavailable", cases: [] },
          after: { state: "pending", cases: [] },
        }
        save(value)
        return value
      })
      const response = structuredClone(run),
        controller = new AbortController()
      const task = Promise.resolve()
        .then(() => execute(run, controller.signal))
        .finally(() => active.delete(run.id))
      active.set(run.id, { controller, task })
      return response
    },
    cancel,
    async recover() {
      for (const run of deps.captures.all()) {
        if (run.state !== "finished") {
          run.state = "finished"
          run.outcome = "interrupted"
          run.finishedAt = new Date().toISOString()
          run.error = "Server stopped before capture completion"
          save(run)
        }
        if (run.outcome === "interrupted" || run.cleanupError) {
          await cleanup(run)
        }
      }
    },
    async close() {
      closing = true
      await Promise.all([...active.keys()].map(cancel))
    },
  }
}
