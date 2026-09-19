import { problem } from "../core/problems.js"
import type { Store } from "../core/types/contracts.js"
import type { GitDiff, GitImage, GitImageQuery } from "../core/types/git.js"
import type { GraphPage, GraphQuery, ProjectGraph } from "../core/types/git-graph.js"

export function createProjectGraph(deps: {
  image: (root: string, query: GitImageQuery) => Promise<GitImage>
  fetch: (root: string) => Promise<{ remotes: string[] }>
  diff: (root: string, oid: string) => Promise<GitDiff>
  store: Pick<Store, "getProject">
  read: (root: string, query: GraphQuery) => Promise<GraphPage>
}): ProjectGraph {
  const fetching = new Set<string>()
  function root(id: string) {
    const project = deps.store.getProject(id) ?? problem("not_found", "Project not found")
    if (project.location.kind !== "git") {
      problem("invalid_input", "Git Graph requires a Git project")
    }
    return project.location.commonGitdir
  }
  return {
    async image(id, query) {
      return deps.image(root(id), query)
    },
    async fetch(id) {
      const directory = root(id)
      if (fetching.has(directory)) {
        problem("worktree_busy", "Git fetch is already running")
      }
      fetching.add(directory)
      try {
        return await deps.fetch(directory)
      } finally {
        fetching.delete(directory)
      }
    },
    async diff(id, oid) {
      return deps.diff(root(id), oid)
    },
    async history(id, query) {
      return deps.read(root(id), query)
    },
  }
}
