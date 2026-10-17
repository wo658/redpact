import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import {
  assertEnvironmentReservation,
  interruptedEnvironment,
  observedEnvironmentState,
} from "../core/environment-policy.js"
import { executionSettingsSchema } from "../core/execution-settings.js"
import { problem } from "../core/problems.js"
import { environmentRedactions } from "../core/runner-environment.js"
import { testSelectionSchema } from "../core/settings-schema.js"
import type { Store } from "../core/types/contracts.js"
import type { Environment, EnvironmentAdapter } from "../core/types/environment.js"
import type { EnvironmentService, WorktreeService } from "../core/types/services.js"
import type { TestSelection } from "../core/types/settings.js"

export function createEnvironments(deps: {
  store: Store
  worktrees: WorktreeService
  adapter: EnvironmentAdapter
  ownerId: string
}): EnvironmentService {
  const tasks = new Map<string, Promise<void>>()
  const controls = new Map<string, AbortController>()
  let closing = false
  let closeTask: Promise<void> | undefined
  const get = (id: string) =>
    deps.store.getEnvironment(id) ?? problem("not_found", "Environment not found")
  function save(id: string, changes: Partial<Environment>) {
    const record = { ...get(id), ...changes, updatedAt: new Date().toISOString() }
    deps.store.saveEnvironment(record)
    return record
  }
  function task(id: string, operation: () => Promise<void>) {
    const promise = Promise.resolve()
      .then(operation)
      .catch(() => {
        save(id, {
          state: "failed",
          errors: ["Environment operation failed; inspect retained resources"],
        })
      })
      .finally(() => {
        if (tasks.get(id) === promise) {
          tasks.delete(id)
        }
      })
    tasks.set(id, promise)
    return promise
  }
  async function refresh(id: string) {
    const record = get(id)
    if (["preparing", "stopping", "stopped"].includes(record.state) && tasks.has(id)) {
      return record
    }
    if (record.state === "stopped") {
      return record
    }
    try {
      const observation = await deps.adapter.inspect(record)
      const latest = get(id)
      if (["stopping", "stopped"].includes(latest.state)) {
        return latest
      }
      const state =
        latest.lifecycle === "manual" && latest.state === "unavailable" && observation.healthy
          ? "ready"
          : observedEnvironmentState(latest.state, observation.healthy)
      const change = {
        resources: observation.resources,
        endpoints: observation.endpoints,
        runtimeId: observation.runtimeId,
        state,
        ...(state === "ready" && latest.state === "unavailable" ? { errors: [] } : {}),
      }
      if (
        Object.entries(change).every(([key, value]) =>
          isDeepStrictEqual(latest[key as keyof Environment], value),
        )
      ) {
        return latest
      }
      return save(id, change)
    } catch {
      const latest = get(id)
      if (["stopping", "stopped"].includes(latest.state)) {
        return latest
      }
      const state = latest.state === "stop_failed" ? "stop_failed" : "unavailable"
      const errors = ["Runtime is unavailable or ownership could not be verified"]
      if (latest.state === state && isDeepStrictEqual(latest.errors, errors)) {
        return latest
      }
      return save(id, { state, errors })
    }
  }
  async function inputs(
    resolved: Awaited<ReturnType<WorktreeService["resolve"]>>,
    selection: TestSelection,
    expectedSettingsDigest: string,
  ) {
    const validation = await resolved.settings.read(selection)
    if (!validation.valid || !validation.settings || !validation.digest) {
      throw Object.assign(new Error("Invalid environment settings"), {
        code: "settings_invalid",
        validation,
      })
    }
    const specification = validation.settings
    const plan = validation.plan
    if (!plan || !expectedSettingsDigest || expectedSettingsDigest !== validation.digest) {
      problem(
        "environment_conflict",
        "Provide a valid selection and current expectedSettingsDigest",
      )
    }
    const executionSettings = executionSettingsSchema.parse({
      environment: { compose: { files: specification.composeFiles, profiles: [] }, variables: {} },
      tests: {
        timeoutMs: specification.tests.timeoutMs,
        env: specification.tests.env,
      },
    })
    const inputDigest = await deps.adapter.fingerprint(resolved.worktree.projectRoot, {
      settings: executionSettings,
      plan,
    })
    return { validation, specification, plan, executionSettings, inputDigest }
  }
  async function prepare(
    worktreeId: string,
    requestId: string,
    expectedSettingsDigest: string,
    selection: TestSelection,
    runId: string | null,
    expectedInputDigest?: string,
    manualScope: "main" | "worktree" = "worktree",
  ) {
    if (closing) {
      problem("closing", "Server is shutting down")
    }
    if (runId !== null && !runId) {
      problem("invalid_input", "Environment preparation requires an execution ID")
    }
    selection = testSelectionSchema.parse(selection)
    const previous = deps.store.listEnvironments().find((env) => env.requestId === requestId)
    if (previous) {
      if (previous.target.worktreeId !== worktreeId) {
        problem("environment_conflict", "Request ID belongs to another worktree")
      }
      if (
        (runId === null ? previous.lifecycle !== "manual" : !previous.runIds.includes(runId)) ||
        previous.settingsDigest !== expectedSettingsDigest ||
        (expectedInputDigest !== undefined && previous.inputDigest !== expectedInputDigest) ||
        !isDeepStrictEqual(previous.selection, selection)
      ) {
        problem("environment_conflict", "Request ID has different selection or digest")
      }
      return previous
    }
    const resolved = await deps.worktrees.resolve(worktreeId)
    if (
      runId === null &&
      deps.store
        .listEnvironments()
        .some(
          (env) =>
            env.lifecycle === "manual" &&
            env.target.worktreeId === worktreeId &&
            env.state !== "stopped",
        )
    ) {
      problem("environment_conflict", "A manual environment already exists for this worktree")
    }
    const { validation, specification, plan, executionSettings, inputDigest } = await inputs(
      resolved,
      selection,
      expectedSettingsDigest,
    )
    if (closing) {
      problem("closing", "Server is shutting down")
    }
    if (expectedInputDigest !== undefined && inputDigest !== expectedInputDigest) {
      problem("configuration_error", "Application inputs changed after execution approval")
    }
    const id = randomUUID()
    const record: Environment = {
      id,
      requestId,
      ownerId: deps.ownerId,
      target: {
        projectId: resolved.worktree.projectId,
        worktreeId,
        projectRoot: resolved.worktree.projectRoot,
        checkoutRoot: resolved.worktree.checkoutRoot,
      },
      projectName: `redpact-${deps.ownerId}-${id}`,
      settings: executionSettings,
      specification,
      selection,
      plan,
      bundle: validation.bundle!.files.map(({ path, sha256 }) => ({ path, sha256 })),
      projectRules: validation.projectRules,
      settingsDigest: expectedSettingsDigest,
      inputDigest,
      state: "preparing",
      ...(runId === null ? { manualScope: manualScope } : {}),
      lifecycle: runId === null ? "manual" : "run",
      runIds: runId === null ? [] : [runId],
      resources: [],
      endpoints: {},
      services: [],
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    deps.store.saveEnvironment(record)
    const control = new AbortController()
    controls.set(id, control)
    void task(id, async () => {
      try {
        await deps.adapter.prepare(record, control.signal, (change) => {
          save(id, change)
        })
        if (control.signal.aborted) {
          throw new Error("Preparation cancelled")
        }
        if (get(id).state !== "stopping") {
          save(id, { state: get(id).runId ? "in_use" : "ready" })
        }
      } catch (error) {
        if (get(id).state !== "stopping") {
          save(id, {
            state: "failed",
            errors: get(id).errors.length
              ? get(id).errors
              : [
                  error instanceof Error && error.message.startsWith("Fixed host port conflict")
                    ? error.message
                    : "Environment preparation failed; inspect preparation.log and retained resources",
                ],
          })
        }
      } finally {
        controls.delete(id)
      }
    })
    return record
  }
  const service: EnvironmentService = {
    get,
    refresh,
    async fingerprint(worktreeId, selection, expectedSettingsDigest) {
      const resolved = await deps.worktrees.resolve(worktreeId)
      return (await inputs(resolved, testSelectionSchema.parse(selection), expectedSettingsDigest))
        .inputDigest
    },
    temporary() {
      return deps.store.listEnvironments().filter((env) => env.state !== "stopped")
    },
    list(worktreeId: string) {
      deps.worktrees.getWorktree(worktreeId)
      return deps.store.listEnvironments().filter((env) => env.target.worktreeId === worktreeId)
    },
    async prepare(
      worktreeId,
      requestId,
      expectedSettingsDigest,
      selection,
      runId,
      expectedInputDigest,
      manualScope,
    ) {
      return deps.worktrees.exclusive(() =>
        prepare(
          worktreeId,
          requestId,
          expectedSettingsDigest,
          selection,
          runId,
          expectedInputDigest,
          manualScope,
        ),
      )
    },
    abortPreparations() {
      closing = true
      for (const control of controls.values()) {
        control.abort()
      }
    },
    async reserve(id: string, worktreeId: string, runId: string, settingsDigest: string) {
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      const record = await refresh(id)
      assertEnvironmentReservation(record, {
        worktreeId,
        ownerId: deps.ownerId,
        runId,
        settingsDigest,
      })
      if (
        (await deps.adapter.fingerprint(record.target.projectRoot, record)) !== record.inputDigest
      ) {
        problem("environment_conflict", "Inputs changed; prepare a new environment")
      }
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      return save(id, {
        state: "in_use",
        runId,
        runIds: [...new Set([...record.runIds, runId])],
      })
    },
    async redactionValues(id: string) {
      const record = get(id)
      return environmentRedactions(record)
    },
    async executionValues(id: string) {
      const record = await refresh(id)
      if (record.state !== "in_use") {
        problem("environment_error", "Environment is no longer healthy")
      }
      if (
        (await deps.adapter.fingerprint(record.target.projectRoot, record)) !== record.inputDigest
      ) {
        problem("configuration_error", "Application inputs changed while queued")
      }
      return { ...record.settings.tests.env }
    },
    async healthy(id: string) {
      return (await refresh(id)).state === "in_use"
    },
    finish(id: string, runId?: string) {
      const record = get(id)
      if (runId && record.runId !== runId) {
        return
      }
      if (record.state === "preparing") {
        controls.get(id)?.abort()
      }
      let state = record.state
      if (state === "in_use") {
        state = "completed"
      }
      save(id, { state, runId: undefined })
    },
    async beginStop(id: string) {
      return deps.worktrees.exclusive(() => {
        const record = get(id)
        if (record.state === "stopped") {
          return record
        }
        if (record.state !== "stopping") {
          save(id, { state: "stopping", errors: [] })
        }
        controls.get(id)?.abort()
        return get(id)
      })
    },
    failStop(id: string) {
      if (get(id).state === "stopping") {
        save(id, {
          state: "stop_failed",
          errors: [
            "Execution cancellation could not be confirmed; resources retained. Retry stop.",
          ],
        })
      }
    },
    async completeStop(id: string) {
      const record = get(id)
      if (record.state === "stopped") {
        return record
      }
      if (record.state !== "stopping") {
        problem("environment_conflict", "Begin environment stop before removing resources")
      }
      await tasks.get(id)
      try {
        await deps.adapter.stop(get(id))
        save(id, { state: "stopped", resources: [], endpoints: {}, errors: [] })
      } catch (error) {
        const latest = get(id)
        const observation = await deps.adapter.inspect(latest).catch(() => undefined)
        const diagnostic = environmentRedactions(latest)
          .reduce(
            (text, secret) => text.split(secret).join("[REDACTED]"),
            error instanceof Error
              ? error.message
              : "Cleanup failed; retained ownership can be retried",
          )
          .slice(-65536)
        save(id, {
          state: "stop_failed",
          ...(observation
            ? { resources: observation.resources, endpoints: observation.endpoints }
            : {}),
          errors: [diagnostic],
        })
      }
      return get(id)
    },
    async recover() {
      for (const record of deps.store.listEnvironments()) {
        if (record.state === "stopped") {
          if (record.ownerId !== deps.ownerId) {
            continue
          }
          if (record.runtimeId) {
            const observation = await deps.adapter.inspect(record).catch(() => undefined)
            if (observation?.resources.length) {
              save(record.id, {
                state: "stop_failed",
                resources: observation.resources,
                endpoints: observation.endpoints,
                errors: ["Owned resources remain after earlier cleanup; retry Stop"],
              })
            }
          }
          continue
        }
        if (record.ownerId !== deps.ownerId) {
          throw new Error("Environment owner mismatch")
        }
        const interrupted = interruptedEnvironment(record.state)
        if (interrupted) {
          save(record.id, interrupted)
        }
        if (get(record.id).runId) {
          save(record.id, { runId: undefined })
        }
        await refresh(record.id)
      }
    },
    async idle() {
      await Promise.all([...tasks.values()])
    },
    close() {
      closeTask ??= (async () => {
        closing = true
        for (const controller of controls.values()) {
          controller.abort()
        }
        await Promise.all([...tasks.values()])
        try {
          for (const record of service.temporary()) {
            if (record.lifecycle === "run" || record.manualScope === "worktree") {
              await service.beginStop(record.id)
              await service.completeStop(record.id)
            }
          }
        } finally {
          // Failed cleanup must not keep IPC workers (and the runtime process) alive.
          await deps.adapter.close?.()
        }
      })()
      return closeTask
    },
  }
  return service
}
