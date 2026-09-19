import { randomUUID } from "node:crypto"
import { problem } from "../core/problems.js"
import { startWorkInput } from "../core/start-work-schema.js"
import type { Store } from "../core/types/contracts.js"
import type { WorkStarts, WorktreeAdmission, WorktreeService } from "../core/types/services.js"
import type { StartWorkInput, WorkStart, WorktreeAdapter } from "../core/types/start-work.js"

export function createWorkStarts(deps: {
  store: Store
  git?: WorktreeAdapter
  worktrees: Pick<WorktreeService, "exclusive">
}): WorkStarts {
  function get(id: string) {
    return deps.store.getWorkStart(id) ?? problem("not_found", "Work start request not found")
  }
  function recovery(record: WorkStart, error: unknown): never {
    throw Object.assign(new Error(error instanceof Error ? error.message : "Work start failed"), {
      code: "work_start_incomplete",
      recovery: {
        requestId: record.id,
        checkoutRoot: record.checkoutRoot,
        worktreeId: record.worktreeId,
        workItemId: record.workItemId,
        state: record.state,
        nextStep:
          record.state === "attempted"
            ? "Inspect the recorded path and Git worktree list. Creation may be incomplete; no automatic retry or deletion is performed. Verify the checkout with Git, then use run_tests with its path."
            : "Retry start_work with the same requestId and inputs to resume record publication.",
      },
    })
  }
  async function start(raw: StartWorkInput, admission: WorktreeAdmission) {
    const parsed = startWorkInput.safeParse(raw)
    if (!parsed.success) {
      problem("invalid_input", parsed.error.message)
    }
    const input = parsed.data
    const project =
      deps.store.getProject(input.projectId) ?? problem("not_found", "Project not found")
    if (project.location.kind !== "git") {
      problem("invalid_input", "Worktree creation requires a Git project")
    }
    const git =
      deps.git ?? problem("worktree_unavailable", "Worktree creation adapter is not connected")
    let record = deps.store.getWorkStart(input.requestId)
    if (record && JSON.stringify(record.input) !== JSON.stringify(input)) {
      problem("work_start_conflict", "requestId already belongs to different inputs")
    }
    if (!record) {
      const planned = await git.plan(project.location.commonGitdir, input)
      record = {
        id: input.requestId,
        input,
        ...planned,
        worktreeId: randomUUID(),
        workItemId: randomUUID(),
        createdAt: new Date().toISOString(),
        state: "prepared",
      }
      // Publish the destination and stable IDs before any Git mutation.
      deps.store.saveWorkStart(record)
    }
    try {
      if (record.state === "attempted") {
        recovery(record, new Error("Previous Git creation has an uncertain outcome"))
      }
      if (record.state === "prepared") {
        record = { ...record, state: "attempted" }
        deps.store.saveWorkStart(record)
        await git.create(project.location.commonGitdir, record)
        const created = { ...record, state: "created" as const }
        deps.store.saveWorkStart(created)
        record = created
      }
      if (record.state !== "completed") {
        const worktree = await admission.ensure(project.id, record.checkoutRoot, {
          id: record.worktreeId,
        })
        if (worktree.id !== record.worktreeId) {
          problem(
            "work_start_conflict",
            "Created path was attached by another request; inspect its worktree binding",
          )
        }
        const previous = deps.store.getWorkItem(record.workItemId)
        if (!previous) {
          deps.store.createWorkItem({
            id: record.workItemId,
            intent: input.intent,
            projectId: project.id,
            worktreeId: worktree.id,
            createdAt: record.createdAt,
          })
        }
        const completed = { ...record, state: "completed" as const }
        deps.store.saveWorkStart(completed)
        record = completed
      }
      const worktree =
        deps.store.getWorktree(record.worktreeId) ??
        problem("not_found", "Created worktree record is missing")
      return {
        requestId: record.id,
        workItemId: record.workItemId,
        worktreeId: worktree.id,
        projectId: project.id,
        checkoutRoot: worktree.checkoutRoot,
        projectRoot: worktree.projectRoot,
        revision: record.revision,
        configure: {
          tool: "configure",
          arguments: { action: "describe", worktreeId: worktree.id },
        },
        nextSteps: [
          "Continue work in projectRoot.",
          "Call configure describe, write .redpact/settings.json, then call configure validate with this worktreeId.",
          "Environment preparation is a separate operation; this call does not establish readiness or human approval.",
        ],
      }
    } catch (error) {
      recovery(record, error)
    }
  }
  return {
    get,
    start(input: StartWorkInput) {
      return deps.worktrees.exclusive((admission) => start(input, admission))
    },
  }
}
