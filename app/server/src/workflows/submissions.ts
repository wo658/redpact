import { randomUUID } from "node:crypto"
import { problem } from "../core/problems.js"
import { prepareSubmissionSources } from "../core/submission-policy.js"
import type {
  ParsedFile,
  SourceFile,
  Store,
  Submission,
  WorkItem,
} from "../core/types/contracts.js"
import type { SubmissionsService, WorktreeService } from "../core/types/services.js"

export function createSubmissions(deps: {
  store: Store
  parse: (path: string, source: string) => ParsedFile
  runnerVersion: string
  projectRoot?: string
  defaultWorktreeId?: string
  worktrees?: WorktreeService
}): SubmissionsService {
  function workItem(intent: string, worktreeId?: string): WorkItem {
    if (!intent.trim()) {
      problem("invalid_input", "Development intent is required")
    }
    if (!worktreeId) {
      problem("target_required", "Choose a worktreeId before submitting work")
    }
    const worktree = deps.store.getWorktree(worktreeId)
    if (!worktree) {
      problem("not_found", "Worktree not found")
    }
    const item = {
      id: randomUUID(),
      intent,
      createdAt: new Date().toISOString(),
      worktreeId: worktree.id,
      projectId: worktree.projectId,
    }
    return item
  }
  function prepare(work: WorkItem, files: SourceFile[]): Submission {
    const prepared = prepareSubmissionSources(files, deps.runnerVersion)
    const worktree = work.worktreeId ? deps.store.getWorktree(work.worktreeId) : undefined
    const submission: Submission = {
      ...(deps.projectRoot ? { projectRoot: deps.projectRoot } : {}),
      ...(worktree
        ? {
            projectRoot: worktree.projectRoot,
            projectId: worktree.projectId,
            worktreeId: worktree.id,
          }
        : {}),
      id: randomUUID(),
      workItemId: work.id,
      files: prepared.files,
      digest: prepared.digest,
      runnerVersion: deps.runnerVersion,
      parsed: prepared.files
        .filter((file) => /\.[jt]s$/.test(file.path))
        .map((file) => ({ path: file.path, review: deps.parse(file.path, file.source) })),
      createdAt: new Date().toISOString(),
    }
    return submission
  }
  return {
    list(worktreeId: string, before?: string) {
      if (!deps.store.getWorktree(worktreeId)) {
        problem("not_found", "Worktree not found")
      }
      const records = deps.store.submissionPage(worktreeId, before, 21)
      if (!records) {
        problem("invalid_input", "Invalid submission cursor")
      }
      const page = records.slice(0, 20)
      return {
        items: page.map(({ id, workItemId, digest, createdAt }) => ({
          id,
          workItemId,
          digest,
          createdAt,
          intent: deps.store.getWorkItem(workItemId)?.intent ?? "",
        })),
        nextCursor: records.length > 20 ? (page.at(-1)?.id ?? null) : null,
      }
    },
    latest(worktreeId: string) {
      if (!deps.store.getWorktree(worktreeId)) {
        problem("not_found", "Worktree not found")
      }
      return deps.store.submissionPage(worktreeId, undefined, 1)?.[0]
    },
    async submitObserved(intent: string, worktreeId: string, files: SourceFile[]) {
      if (!deps.worktrees) {
        problem("worktree_unavailable", "Worktree service is not connected")
      }
      await deps.worktrees.resolve(worktreeId)
      const work = workItem(intent, worktreeId)
      const latest = this.latest(worktreeId)
      const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
      if (
        latest?.runnerVersion === deps.runnerVersion &&
        JSON.stringify(latest.files) === JSON.stringify(sorted)
      ) {
        return latest
      }
      // Validate and parse before publishing either immutable record.
      const submission = prepare(work, files)
      // No await between deduplication and publication: simultaneous observers share this boundary.
      deps.store.createWorkItem(work)
      deps.store.createSubmission(submission)
      return submission
    },
    async createWork(intent: string, worktreeId?: string) {
      worktreeId ??= deps.defaultWorktreeId
      if (deps.worktrees && !worktreeId) {
        problem("target_required", "Choose a worktreeId before submitting work")
      }
      if (worktreeId) {
        await deps.worktrees?.resolve(worktreeId)
      }
      if (worktreeId && !deps.worktrees) {
        problem("invalid_input", "Worktree service is not connected")
      }
      return this.createWorkItem(intent, worktreeId)
    },
    async submitForWork(workItemId: string, files: SourceFile[]) {
      const work = deps.store.getWorkItem(workItemId) ?? problem("not_found", "Work item not found")
      if (work.worktreeId) {
        if (!deps.worktrees) {
          problem("worktree_unavailable", "Worktree service is not connected")
        }
        await deps.worktrees.resolve(work.worktreeId)
      }
      return this.submit(workItemId, files)
    },
    getWork(id: string) {
      return deps.store.getWorkItem(id) ?? problem("not_found", "Work item not found")
    },
    listWork(projectId: string) {
      return deps.store.listWorkItems().filter((item) => item.projectId === projectId)
    },
    createWorkItem(intent: string, worktreeId?: string): WorkItem {
      const item = workItem(intent, worktreeId)
      deps.store.createWorkItem(item)
      return item
    },
    submit(workItemId: string, files: SourceFile[]): Submission {
      const work = deps.store.getWorkItem(workItemId) ?? problem("not_found", "Work item not found")
      const submission = prepare(work, files)
      deps.store.createSubmission(submission)
      return submission
    },
    get(id: string) {
      return deps.store.getSubmission(id) ?? problem("not_found", "Submission not found")
    },
  }
}
