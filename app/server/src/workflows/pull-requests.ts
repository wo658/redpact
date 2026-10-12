import { problem } from "../core/problems.js"
import { publishPullRequestSchema } from "../core/pull-request-schema.js"
import type { GitMutations } from "../core/types/merge.js"
import type {
  GitHubPullRequests,
  PublishPullRequest,
  PullRequestInspection,
  PullRequestService,
} from "../core/types/pull-requests.js"

export function createPullRequests(deps: {
  git: Pick<GitMutations, "inspect">
  github: GitHubPullRequests
  worktrees: { resolve(id: string): Promise<{ worktree: { checkoutRoot: string } }> }
}): PullRequestService {
  const active = new Map<string, Promise<unknown>>()
  const operating = new Map<string, number>()
  let closing = false
  async function inspectRoot(root: string): Promise<PullRequestInspection> {
    const source = await deps.git.inspect(root)
    if (source.blockedReason) {
      problem("worktree_busy", source.blockedReason)
    }
    if (source.dirty) {
      problem("worktree_busy", "Commit all changes before publishing a PR")
    }
    if (!source.branch || !source.head) {
      problem("worktree_busy", "Check out a branch with commits before publishing a PR")
    }
    const target = await deps.github.inspect(root, source.branch, source.head)
    if (target.baseBranch === source.branch) {
      problem("worktree_busy", "The remote default branch cannot be published as a PR")
    }
    return { ...target, revision: source.revision }
  }
  async function publish(root: string, input: PublishPullRequest) {
    const current = await inspectRoot(root)
    for (const key of [
      "revision",
      "repository",
      "branch",
      "head",
      "baseBranch",
      "pushUrl",
    ] as const) {
      if (current[key] !== input[key]) {
        problem("worktree_busy", "The worktree or remote target changed; reopen the PR form")
      }
    }
    const source = await deps.git.inspect(root)
    if (
      source.dirty ||
      source.blockedReason ||
      source.revision !== current.revision ||
      source.branch !== current.branch ||
      source.head !== current.head
    ) {
      problem("worktree_busy", "The worktree changed; reopen the PR form")
    }
    await deps.github.push(root, current)
    try {
      const existing = await deps.github.find(root, current)
      if (existing) {
        return existing
      }
      return await deps.github.create(root, current, input.title, input.body)
    } catch {
      // Creation may have succeeded even when its response was lost.
      const recovered = await deps.github.find(root, current).catch(() => null)
      if (recovered) {
        return recovered
      }
      problem(
        "worktree_busy",
        "The branch was pushed, but PR publication was not confirmed. Retry to check for an existing PR.",
      )
    }
  }
  return {
    connection: () => deps.github.connection(),
    async inspect(id) {
      const { worktree } = await deps.worktrees.resolve(id)
      return inspectRoot(worktree.checkoutRoot)
    },
    async publish(id, input) {
      operating.set(id, (operating.get(id) ?? 0) + 1)
      try {
        const parsed = publishPullRequestSchema.safeParse(input)
        if (!parsed.success) {
          problem("invalid_input", "Invalid PR publication request")
        }
        const { worktree } = await deps.worktrees.resolve(id)
        const source = await deps.git.inspect(worktree.checkoutRoot)
        if (closing) {
          problem("closing", "Redpact is stopping")
        }
        if (active.has(source.commonGitdir)) {
          problem("worktree_busy", "PR publication is already running in this repository")
        }
        const task = publish(worktree.checkoutRoot, parsed.data)
        active.set(source.commonGitdir, task)
        try {
          return await task
        } finally {
          active.delete(source.commonGitdir)
        }
      } finally {
        const remaining = (operating.get(id) ?? 1) - 1
        if (remaining) {
          operating.set(id, remaining)
        } else {
          operating.delete(id)
        }
      }
    },
    busy: (ids) => [...operating.keys()].some((id) => !ids || ids.includes(id)),
    async close() {
      closing = true
      await Promise.allSettled(active.values())
    },
  }
}
