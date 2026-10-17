import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { problem } from "../core/problems.js"
import type {
  ExecutionReviewInput,
  ExecutionReviewRecord,
  ExecutionReviewStore,
  ExecutionReviews,
  ExecutionReviewView,
} from "../core/types/execution-reviews.js"
import type { ExecutionScopeService } from "../core/types/execution-scope.js"
import type { CaptureService, CaptureWorkflow } from "../core/types/playwright.js"
import type { EnvironmentService, WorktreeService } from "../core/types/services.js"
import type { UnitTestsService } from "../core/types/unit-tests.js"

export function createExecutionReviews(deps: {
  store: ExecutionReviewStore
  worktrees: WorktreeService
  units: UnitTestsService
  captures: CaptureService
  playwright: CaptureWorkflow
  environments: EnvironmentService
  executionScopes?: ExecutionScopeService
  sourceDigest(root: string, directory: string): Promise<string>
}): ExecutionReviews {
  const records = new Map(deps.store.list().map((record) => [record.id, record]))
  const active = new Map<string, Promise<ExecutionReviewView>>()
  let closing = false
  function save(record: ExecutionReviewRecord) {
    deps.store.save(record)
    records.set(record.id, structuredClone(record))
  }
  for (const record of records.values()) {
    if (record.state === "starting") {
      save({
        ...record,
        state: "interrupted",
        error:
          "Server stopped during admission; inspect execution history before requesting again.",
      })
    }
  }
  function find(id: string) {
    return records.get(id) ?? [...records.values()].find((record) => record.runId === id)
  }
  function view(record: ExecutionReviewRecord): ExecutionReviewView {
    const { token: _token, ...review } = structuredClone(record)
    return {
      review,
      ...(record.runId
        ? {
            run:
              record.kind === "unit"
                ? deps.units.get(record.runId)
                : deps.captures.get(record.runId),
          }
        : {}),
    }
  }
  async function exclusive(
    id: string,
    action: () => Promise<ExecutionReviewView>,
  ): Promise<ExecutionReviewView> {
    const previous = active.get(id)
    if (previous) {
      await previous.catch(() => {})
    }
    if (active.has(id)) {
      return exclusive(id, action)
    }
    const task = action()
    active.set(id, task)
    try {
      return await task
    } finally {
      active.delete(id)
    }
  }
  async function inputs(worktreeId: string, input: ExecutionReviewInput) {
    const target = await deps.worktrees.resolve(worktreeId)
    const result = await target.settings.read()
    if (!result.valid || !result.digest || !result.settings) {
      problem("configuration_error", "Fix shared project settings before requesting execution")
    }
    const settingsDigest = result.digest
    if (input.kind === "unit") {
      const unit = await deps.units.preview(worktreeId, input.executionScope)
      return {
        settingsDigest,
        inputDigest: unit.inputDigest,
        specification: unit.settings,
        ...(unit.executionSelection ? { executionSelection: unit.executionSelection } : {}),
      }
    }
    const settings = result.settings.playwright
    const declaration = settings && input.target ? settings.targets[input.target] : undefined
    if (!settings || !declaration || !input.target) {
      problem("invalid_input", "Choose a declared Playwright target")
    }
    const selection =
      (await deps.worktrees.getSelection(worktreeId)) ??
      problem("invalid_input", "Playwright execution plan is unavailable")
    const inputDigest = await deps.environments.fingerprint(worktreeId, selection, settingsDigest)
    const executionSelection = await deps.executionScopes?.resolve(worktreeId, input)
    const sourceDigest = await deps.sourceDigest(target.worktree.projectRoot, settings.directory)
    return {
      settingsDigest,
      inputDigest,
      sourceDigest,
      ...(executionSelection ? { executionSelection } : {}),
      specification: {
        target: input.target,
        purpose: declaration.purpose,
        viewport: input.viewport ?? settings.viewport,
      },
    }
  }
  return {
    async request(input) {
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      const project = await deps.worktrees.connect(input.path)
      const checkout = await deps.worktrees.ensure(project.id, input.path)
      const captured = await inputs(checkout.id, input)
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      const record: ExecutionReviewRecord = {
        version: 1,
        id: randomUUID(),
        kind: input.kind,
        path: checkout.projectRoot,
        worktreeId: checkout.id,
        projectId: project.id,
        policy: "ask",
        state: "pending",
        revision: 0,
        createdAt: new Date().toISOString(),
        token: randomBytes(32).toString("hex"),
        ...captured,
      }
      save(record)
      return view(record)
    },
    get(id) {
      const record = find(id)
      return record ? view(record) : undefined
    },
    list: () => [...records.values()].map(view),
    capability(id) {
      return (find(id) ?? problem("not_found", "Execution review not found")).token
    },
    async approve(input) {
      return exclusive(input.id, async () => {
        const record = records.get(input.id) ?? problem("not_found", "Execution review not found")
        const token = Buffer.from(input.token)
        const expected = Buffer.from(record.token)
        if (token.length !== expected.length || !timingSafeEqual(token, expected)) {
          problem("invalid_input", "Invalid UI capability")
        }
        if (record.state === "started") {
          return view(record)
        }
        if (record.state !== "pending" || record.revision !== input.revision) {
          problem("invalid_input", "Review changed; reopen the latest request")
        }
        const specification = record.specification
        const current = await inputs(record.worktreeId, {
          kind: record.kind,
          path: record.path,
          executionScope: record.executionSelection?.requested,
          ...("target" in specification
            ? { target: specification.target, viewport: specification.viewport }
            : {}),
        })
        if (
          !isDeepStrictEqual(current, {
            settingsDigest: record.settingsDigest,
            inputDigest: record.inputDigest,
            ...(record.sourceDigest ? { sourceDigest: record.sourceDigest } : {}),
            specification,
            ...(record.executionSelection ? { executionSelection: record.executionSelection } : {}),
          })
        ) {
          problem(
            "configuration_error",
            "Execution inputs changed during review; request a new execution",
          )
        }
        if (closing) {
          problem("closing", "Server is shutting down")
        }
        save({ ...record, state: "starting", revision: record.revision + 1 })
        let run: NonNullable<ExecutionReviewView["run"]>
        try {
          if (record.kind === "unit" && "command" in specification) {
            run = await deps.units.start(record.worktreeId, {
              settings: specification,
              ...(record.executionSelection
                ? { executionSelection: record.executionSelection }
                : {}),
              inputDigest: record.inputDigest,
            })
          } else if (
            record.kind === "playwright" &&
            "target" in specification &&
            record.sourceDigest
          ) {
            run = await deps.playwright.start(
              record.worktreeId,
              undefined,
              specification.viewport,
              specification.target,
              {
                settingsDigest: record.settingsDigest,
                inputDigest: record.inputDigest,
                sourceDigest: record.sourceDigest,
                ...(record.executionSelection
                  ? { executionSelection: record.executionSelection }
                  : {}),
              },
            )
          } else {
            problem("invalid_input", "Execution review has an incompatible specification")
          }
        } catch (error) {
          save({
            ...record,
            state: "failed",
            revision: record.revision + 1,
            error: error instanceof Error ? error.message : "Execution admission failed",
          })
          throw error
        }
        // A failed final persistence remains uncertain; never relabel an admitted run as failed admission.
        const started = {
          ...record,
          state: "started" as const,
          revision: record.revision + 1,
          runId: run.id,
        }
        save(started)
        return view(started)
      })
    },
    async cancel(id) {
      const record = find(id)
      if (!record) {
        return undefined
      }
      return exclusive(record.id, async () => {
        const current = records.get(record.id)!
        if (current.runId) {
          if (current.kind === "unit") {
            await deps.units.cancel(current.runId)
          } else {
            await deps.playwright.cancel(current.runId)
          }
          return view(current)
        }
        if (current.state !== "pending") {
          return view(current)
        }
        const cancelled = {
          ...current,
          state: "cancelled" as const,
          revision: current.revision + 1,
        }
        save(cancelled)
        return view(cancelled)
      })
    },
    async close() {
      closing = true
      await Promise.allSettled([...active.values()])
    },
  }
}
