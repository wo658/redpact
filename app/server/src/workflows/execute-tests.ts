import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { problem } from "../core/problems.js"
import { decideRunResult, executionFailureOutcome } from "../core/run-policy.js"
import type { Run, RunResult, Scheduler } from "../core/types/contracts.js"
import type { GitService } from "../core/types/git.js"
import type {
  EnvironmentService,
  ExecuteTests,
  RunService,
  StopEnvironment,
  WorktreeService,
} from "../core/types/services.js"
import type { SettingsResult, SettingsService, TestSelection } from "../core/types/settings.js"
import type { TestConnections } from "../core/types/test-connections.js"

export function createExecuteTests(deps: {
  environments?: EnvironmentService
  runs: RunService
  stopEnvironment?: StopEnvironment
  scheduler: Scheduler
  git?: GitService
  settings: SettingsService
  defaultWorktreeId?: string
  worktrees?: WorktreeService
}): ExecuteTests {
  let closing = false
  const executions = new Set<Promise<void>>()
  const finish = (id: string, result: RunResult) => {
    const run = deps.runs.get(id)
    if (run.state === "finished") {
      return
    }
    deps.runs.finish(id, result)
    settle(run)
  }
  const settle = (run: Run) => {
    if (run.environmentId) {
      deps.environments?.finish(run.environmentId, run.id)
    }
  }
  async function prepareRun(
    run: Run,
    worktreeId: string,
    selection: TestSelection,
    signal: AbortSignal,
  ) {
    const environments =
      deps.environments ?? problem("environment_error", "Environment service is unavailable")
    const worktrees =
      deps.worktrees ?? problem("worktree_unavailable", "Worktree service is unavailable")
    const digest =
      run.settings?.digest ?? problem("configuration_error", "Run settings are unavailable")
    const environment = await environments.prepare(worktreeId, run.id, digest, selection, run.id)
    // Preserve resource identity even when cancellation raced preparation admission.
    run.environmentId = environment.id
    deps.runs.bindEnvironment(run.id, environment.id)
    while (environments.get(environment.id).state === "preparing" && !signal.aborted) {
      await delay(50)
    }
    if (signal.aborted) {
      environments.finish(environment.id)
      return false
    }
    if (environments.get(environment.id).state !== "ready") {
      problem("environment_error", "Environment preparation failed or was stopped")
    }
    const current = await (await worktrees.resolve(worktreeId)).settings.read(selection)
    if (!current.valid || current.digest !== digest) {
      problem("configuration_error", "Settings changed during preparation; start a new run")
    }
    await worktrees.exclusive(() =>
      environments.reserve(environment.id, worktreeId, run.id, digest),
    )
    // Cancellation can finish the queued run while reserve awaits Docker observation.
    if (signal.aborted) {
      environments.finish(environment.id, run.id)
      return false
    }
    return true
  }
  closing = true
  for (const run of deps.runs.unfinished()) {
    finish(run.id, {
      outcome: "interrupted",
      cases: [],
      errors: [
        "Previous server stopped; process/resource reconciliation requires the environment adapter",
      ],
    })
  }
  closing = false
  return {
    async start(
      submissionId: string,
      selection?: TestSelection,
      expectedSettingsDigest?: string,
    ): Promise<Run> {
      const accept = async () => {
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        const submission = deps.runs.submission(submissionId)
        if (!submission.worktreeId) {
          problem("target_required", "Submission needs a recorded worktree; resubmit tests")
        }
        const worktreeId = submission.worktreeId ?? deps.defaultWorktreeId
        const resolved = worktreeId
          ? await (
              deps.worktrees ?? problem("worktree_unavailable", "Worktree service is not connected")
            ).resolve(worktreeId)
          : undefined
        const settingsService = resolved?.settings ?? deps.settings
        if (submission.projectId && resolved?.worktree.projectId !== submission.projectId) {
          problem("project_mismatch", "Submission belongs to a different project")
        }
        if (submission.projectRoot && submission.projectRoot !== settingsService.projectRoot) {
          problem("invalid_input", "Submission belongs to a different project")
        }
        if (!selection && worktreeId) {
          selection = (await deps.worktrees?.getSelection(worktreeId)) ?? undefined
        }
        const settings = await settingsService.read(selection)
        if (
          !settings.valid ||
          !settings.settings ||
          settings.source === undefined ||
          !settings.digest
        ) {
          throw Object.assign(new Error("Project settings are invalid"), {
            code: "settings_invalid",
            validation: settings,
          })
        }
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        if (expectedSettingsDigest && settings.digest !== expectedSettingsDigest) {
          problem("configuration_error", "Settings changed after approval; start a new review")
        }
        const git = await (resolved?.git ?? deps.git)?.inspect()
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        const runId = randomUUID()
        if (!selection || !deps.environments || !worktreeId) {
          problem("environment_conflict", "Select services and dependency modes for this worktree")
        }
        if (selection && deps.worktrees) {
          await deps.worktrees.setSelection(worktreeId, selection)
        }
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        const run: Run = {
          environmentPolicy: { source: "new", retain: "never" },
          ...(resolved && submission.worktreeId
            ? {
                target: {
                  projectId: resolved.worktree.projectId,
                  worktreeId: resolved.worktree.id,
                  projectRoot: resolved.worktree.projectRoot,
                  checkoutRoot: resolved.worktree.checkoutRoot,
                },
              }
            : {}),
          ...(git ? { git } : {}),
          settings: { file: settings.file, source: settings.source, digest: settings.digest },
          id: runId,
          submissionId,
          state: "queued",
          result: null,
          createdAt: new Date().toISOString(),
          finishedAt: null,
          limitations: [
            "Explicit submitted source bundle only; external imports and target app/environment identity are not verified.",
            "Git context, when available, is observed at run acceptance only; it does not freeze code, verify external imports, or establish freshness or human approval.",
          ],
        }
        const controller = deps.runs.accept(run)
        const execution = deps.scheduler
          .add("local", async () => {
            if (controller.signal.aborted) {
              return
            }
            let current: SettingsResult
            try {
              const target = worktreeId
                ? await (
                    deps.worktrees ??
                    problem("worktree_unavailable", "Worktree service is not connected")
                  ).resolve(worktreeId)
                : undefined
              current = await (target?.settings ?? settingsService).read(selection)
            } catch (error) {
              // Cancellation may finish queued work while target resolution is pending.
              if (controller.signal.aborted) {
                return
              }
              finish(run.id, {
                outcome: "configuration_error",
                cases: [],
                errors: [error instanceof Error ? error.message : "Worktree is unavailable"],
              })
              return
            }
            if (controller.signal.aborted) {
              return
            }
            if (!current.valid || current.digest !== run.settings?.digest) {
              finish(run.id, {
                outcome: "configuration_error",
                cases: [],
                errors: [
                  "Settings changed or became invalid while queued; validate and start a new run.",
                ],
              })
              return
            }
            if (
              !run.environmentId &&
              selection &&
              worktreeId &&
              !(await prepareRun(run, worktreeId, selection, controller.signal))
            ) {
              return
            }
            const environmentValues = run.environmentId
              ? await deps.environments?.executionValues(run.environmentId)
              : undefined
            if (controller.signal.aborted) {
              return
            }
            const environment = run.environmentId
              ? deps.environments?.get(run.environmentId)
              : undefined
            const connections: TestConnections = {
              version: 1,
              services: Object.fromEntries(
                (environment?.plan?.activeServices ?? []).map((name) => [
                  name,
                  {
                    ports: Object.fromEntries(
                      Object.entries(environment?.endpoints ?? {})
                        .filter(([key]) => key.startsWith(`${name}:`))
                        .map(([key, endpoint]) => [key.slice(name.length + 1), endpoint]),
                    ),
                  },
                ]),
              ),
            }
            let environmentLost = false
            let checking = false
            const health = run.environmentId
              ? setInterval(() => {
                  if (checking) {
                    return
                  }
                  checking = true
                  void deps.environments
                    ?.healthy(run.environmentId as string)
                    .then((ok) => {
                      if (!ok) {
                        environmentLost = true
                        controller.abort()
                      }
                    })
                    .catch(() => {
                      environmentLost = true
                      controller.abort()
                    })
                    .finally(() => {
                      checking = false
                    })
                }, 1000)
              : undefined
            try {
              const result = await deps.runs.execute(
                run.id,
                current.settings,
                environmentValues,
                run.environmentId
                  ? ((await deps.environments?.secretValues(run.environmentId)) ?? [])
                  : [],
                connections,
              )
              // Preserve cancellation observation before the final asynchronous health check.
              const userCancelled = !result.resourceLimit && deps.runs.wasCancelled(run.id)
              let finalEnvironmentLost = environmentLost
              if (
                !result.resourceLimit &&
                !userCancelled &&
                !finalEnvironmentLost &&
                run.environmentId &&
                !controller.signal.aborted
              ) {
                finalEnvironmentLost = !(await deps.environments?.healthy(run.environmentId))
              }
              const finalResult = decideRunResult(result, {
                userCancelled,
                environmentLost: finalEnvironmentLost,
                aborted: controller.signal.aborted,
              })
              finish(run.id, finalResult)
            } finally {
              if (health) {
                clearInterval(health)
              }
            }
          })
          .catch((error) => {
            const outcome = executionFailureOutcome(controller.signal.aborted, error?.code)
            finish(run.id, {
              outcome,
              cases: [],
              errors: ["Runner could not complete"],
            })
          })
          .finally(async () => {
            deps.runs.release(run.id)
            if (run.environmentId) {
              await deps.stopEnvironment?.(run.environmentId)
            }
          })
        executions.add(execution)
        void execution.finally(() => executions.delete(execution)).catch(() => {})
        return run
      }
      return deps.worktrees ? deps.worktrees.exclusive(accept) : accept()
    },
    cancel(id: string) {
      const previous = deps.runs.get(id)
      const run = deps.runs.cancel(id)
      if (run.environmentId && deps.environments?.get(run.environmentId).state === "preparing") {
        deps.environments.finish(run.environmentId)
      }
      if (previous.state !== "finished" && run.state === "finished" && run.result) {
        settle(run)
      }
      return run
    },
    async close() {
      closing = true
      deps.environments?.abortPreparations()
      for (const id of deps.runs.activeIds()) {
        const previous = deps.runs.get(id)
        const run = deps.runs.cancel(id)
        if (previous.state !== "finished" && run.state === "finished" && run.result) {
          settle(run)
        }
      }
      await deps.scheduler.idle()
      await Promise.allSettled([...executions])
      await deps.stopEnvironment?.idle()
    },
  }
}
