import { join } from "node:path"
import { mergeRequestSchema } from "../core/merge-schema.js"
import { problem } from "../core/problems.js"
import type { Worktree } from "../core/types/contracts.js"
import type {
  GitMutations,
  MergeInspection,
  MergeRecord,
  MergeService,
  MergeStore,
} from "../core/types/merge.js"
import type { ProjectSettingsService } from "../core/types/services.js"

export function createMergeService(deps: {
  git: GitMutations
  worktrees: {
    resolve(
      id: string,
    ): Promise<{ worktree: Pick<Worktree, "id" | "projectId" | "projectRoot" | "checkoutRoot"> }>
    checkoutPaths(id: string): Promise<string[]>
  }
  projects: Pick<ProjectSettingsService, "tracking">
  store: MergeStore
  directory: string
}): MergeService {
  const records = new Map(deps.store.list().map((record) => [record.id, record]))
  const active = new Map<string, Promise<unknown>>()
  const operating = new Map<string, number>()
  let closing = false
  function save(record: MergeRecord) {
    deps.store.save(record)
    records.set(record.id, structuredClone(record))
  }
  for (const record of records.values()) {
    if (record.state === "running") {
      record.state = "interrupted"
      record.cleanupError = "Candidate cleanup was not confirmed before restart"
      record.error =
        "Redpact stopped during merge. Inspect both branches and the candidate path before retrying."
      record.finishedAt = new Date().toISOString()
      record.resolutionRequest = resolution(record)
      save(record)
    }
  }
  async function exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    operating.set(id, (operating.get(id) ?? 0) + 1)
    try {
      return await operate(id, action)
    } finally {
      const remaining = (operating.get(id) ?? 1) - 1
      if (remaining) {
        operating.set(id, remaining)
      } else {
        operating.delete(id)
      }
    }
  }
  async function operate<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (closing) {
      problem("closing", "Redpact is stopping")
    }
    const { worktree } = await deps.worktrees.resolve(id)
    const { commonGitdir } = await deps.git.inspect(worktree.checkoutRoot)
    if (active.has(commonGitdir)) {
      problem("worktree_busy", "Another Git action is running in this repository")
    }
    const task = action()
    active.set(commonGitdir, task)
    try {
      return await task
    } finally {
      active.delete(commonGitdir)
    }
  }
  async function inspect(id: string): Promise<MergeInspection> {
    const { worktree } = await deps.worktrees.resolve(id)
    const source = await deps.git.inspect(worktree.checkoutRoot)
    const { mainBranch } = await deps.projects.tracking(worktree.projectId)
    let target: MergeInspection["target"] = null
    let blockedReason = source.blockedReason
    if (!mainBranch) {
      blockedReason = "Select a main branch in Project settings"
    }
    if (source.branch === mainBranch) {
      blockedReason = "This worktree already has the target branch checked out"
    }
    if (mainBranch && source.branch !== mainBranch) {
      for (const path of await deps.worktrees.checkoutPaths(worktree.projectId)) {
        if ((await deps.git.currentBranch(path)) !== mainBranch) {
          continue
        }
        const checkout = await deps.git.inspect(path)
        if (checkout.branch === mainBranch && checkout.commonGitdir === source.commonGitdir) {
          target = checkout
          break
        }
      }
      if (!target) {
        blockedReason = "Check out the target branch in a worktree before merging"
      }
    }
    if (source.dirty) {
      blockedReason = "Commit or discard all uncommitted changes before merging"
    }
    if (target?.blockedReason) {
      blockedReason = target.blockedReason
    }
    if (target?.dirty) {
      blockedReason = "The target worktree has uncommitted changes; organize them there first"
    }
    return {
      source,
      target,
      targetBranch: mainBranch,
      blockedReason,
      records: [...records.values()]
        .filter((record) => record.worktreeId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  }
  async function perform(record: MergeRecord, inspected: MergeInspection) {
    try {
      const candidate = await deps.git.candidate(
        record.sourceRoot,
        record.candidatePath,
        record.targetHead,
        record.sourceHead,
      )
      record.output = candidate.output
      record.conflicts = candidate.conflicts
      record.mergedHead = candidate.head
      if (candidate.conflicts.length) {
        record.state = "conflict"
        record.error = "Merge conflicts require resolution in the source worktree"
      } else {
        const current = await inspect(record.worktreeId)
        if (
          current.blockedReason ||
          current.source.revision !== inspected.source.revision ||
          current.target?.revision !== inspected.target?.revision
        ) {
          problem(
            "worktree_busy",
            "The source, target or merge configuration changed; review and retry",
          )
        }
        if (!candidate.head || !inspected.target) {
          throw new Error("Merge candidate is unavailable")
        }
        await deps.git.publish(record.targetRoot, inspected.target, candidate.head)
        record.state = "merged"
      }
    } catch (error) {
      record.state = "failed"
      record.error = error instanceof Error ? error.message : String(error)
    } finally {
      try {
        await deps.git.remove(record.sourceRoot, record.candidatePath)
      } catch (error) {
        record.cleanupError = error instanceof Error ? error.message : String(error)
      }
      record.finishedAt = new Date().toISOString()
      record.resolutionRequest = resolution(record)
      save(record)
    }
    return structuredClone(record)
  }
  return {
    inspect,
    commit: (id, revision, message) =>
      exclusive(id, async () => {
        const { worktree } = await deps.worktrees.resolve(id)
        return deps.git.commit(worktree.checkoutRoot, revision, message)
      }),
    discard: (id, revision) =>
      exclusive(id, async () => {
        const { worktree } = await deps.worktrees.resolve(id)
        return deps.git.discard(worktree.checkoutRoot, revision)
      }),
    async merge(id, request) {
      if (!mergeRequestSchema.safeParse(request).success) {
        problem("invalid_input", "Invalid merge request")
      }
      const existing = records.get(request.requestId)
      if (existing) {
        if (existing.worktreeId !== id) {
          problem("invalid_input", "The request ID belongs to another worktree")
        }
        return structuredClone(existing)
      }
      return exclusive(id, async () => {
        const inspected = await inspect(id)
        const { source, target } = inspected
        if (inspected.blockedReason) {
          problem("worktree_busy", inspected.blockedReason)
        }
        if (!source.head || !source.branch || !target?.head || !target.branch) {
          problem("worktree_busy", "Both branches must have commits")
        }
        if (
          source.revision !== request.sourceRevision ||
          target.revision !== request.targetRevision
        ) {
          problem("worktree_busy", "The source or target changed; review before merging")
        }
        const { worktree } = await deps.worktrees.resolve(id)
        const record: MergeRecord = {
          version: 1,
          id: request.requestId,
          worktreeId: id,
          projectId: worktree.projectId,
          sourceRoot: source.root,
          sourceBranch: source.branch,
          sourceHead: source.head,
          targetRoot: target.root,
          targetBranch: target.branch,
          targetHead: target.head,
          candidatePath: join(deps.directory, "merge-candidates", request.requestId),
          mergedHead: null,
          state: "running",
          createdAt: new Date().toISOString(),
          finishedAt: null,
          conflicts: [],
          output: "",
          error: null,
          cleanupError: null,
          resolutionRequest: "",
        }
        save(record)
        return perform(record, inspected)
      })
    },
    busy: (ids) => [...operating.keys()].some((id) => !ids || ids.includes(id)),
    async close() {
      closing = true
      await Promise.allSettled(active.values())
    },
  }
}
function resolution(record: MergeRecord) {
  return [
    `Resolve Redpact merge ${record.id} (${record.state}).`,
    `Source worktree: ${record.sourceRoot}`,
    `Source branch/commit: ${record.sourceBranch} / ${record.sourceHead}`,
    `Target worktree: ${record.targetRoot}`,
    `Target branch/commit at attempt: ${record.targetBranch} / ${record.targetHead}`,
    `Conflicting paths: ${record.conflicts.join(", ") || "none recorded"}`,
    `Error: ${record.error ?? "none"}`,
    `Git output: ${record.output}`,
    `Candidate: ${record.candidatePath}`,
    `Candidate cleanup: ${record.cleanupError ?? "removed"}`,
    "Read repository instructions and compare the recorded commits to recover both changes' intent. Recheck current Git status and branch heads; these records describe a past attempt.",
    "Resolve in the source worktree, preserve both changes, run the relevant tests, and commit. Leave the worktree clean for the user to inspect and retry Merge in Redpact. Do not discard unrelated changes or merge into the target on the user's behalf.",
    "This Git operation does not establish test success or human review approval.",
  ].join("\n")
}
