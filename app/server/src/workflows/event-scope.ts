import { basename, join, relative } from "node:path"
import { problem } from "../core/problems.js"
import type { ChangeRoot } from "../core/types/changes.js"
import type { Services } from "./services.js"

export async function eventScope(
  services: Services,
  query: {
    projectId?: string
    worktreeId?: string
    scope?: string
  },
) {
  if (query.projectId && query.worktreeId) {
    problem("invalid_input", "Choose a project or worktree event scope")
  }
  if (query.scope && !["checkout", "evidence", "preview", "unit", "tests"].includes(query.scope)) {
    problem("invalid_input", "Unknown event scope")
  }
  if (query.scope && !query.worktreeId) {
    problem("invalid_input", "A worktree is required for this event scope")
  }
  const roots: ChangeRoot[] = []
  const runtime = () =>
    services.dataDirectory ?? problem("invalid_input", "Runtime directory unavailable")
  if (query.projectId) {
    const worktrees =
      services.worktrees ?? problem("worktree_unavailable", "Worktree service unavailable")
    const paths = await worktrees.checkoutPaths(query.projectId)
    const project = worktrees.getProject(query.projectId)
    roots.push({ path: join(runtime(), "projects", `${project.id}.json`), kind: "records" })
    const bindings = join(runtime(), "worktrees")
    roots.push({ path: bindings, kind: "records" })
    if (project.location.kind === "git") {
      roots.push({ path: project.location.commonGitdir, kind: "git" })
    }
    if (project.location.kind === "directory") {
      roots.push({ path: join(project.location.root, ".git"), kind: "git" })
    }
    for (const path of paths) {
      roots.push({ path, kind: "checkout" })
    }
    return {
      roots,
      accepts(path: string) {
        if (!relative(bindings, path).startsWith("..") && path.endsWith(".json")) {
          try {
            return worktrees.getWorktree(basename(path, ".json")).projectId === project.id
          } catch {
            return false
          }
        }
        return true
      },
    }
  }
  if (!query.worktreeId) {
    roots.push({ path: join(runtime(), "projects"), kind: "records" })
    return { roots, accepts: () => true }
  }
  const worktrees =
    services.worktrees ?? problem("worktree_unavailable", "Worktree service unavailable")
  if (query.scope === "evidence") {
    const worktree = worktrees.getWorktree(query.worktreeId)
    const selectionFile = join(worktree.projectRoot, ".redpact/selection.json")
    roots.push({ path: join(worktree.projectRoot, ".redpact"), kind: "checkout" })
    const data = runtime()
    for (const directory of [
      "submissions",
      "runs",
      "environments",
      "unit-runs",
      "playwright-runs",
    ]) {
      roots.push({ path: join(data, directory), kind: "records" })
    }
    return {
      roots,
      accepts(path: string) {
        const [kind, file, state] = relative(data, path).split(/[\\/]/)
        try {
          if (path === selectionFile) {
            return true
          }
          if (kind === "submissions" && file?.endsWith(".json")) {
            return services.submissions.get(basename(file, ".json")).worktreeId === query.worktreeId
          }
          if (kind === "runs" && state === "state.json") {
            return services.runs.get(file).target?.worktreeId === query.worktreeId
          }
          if (kind === "unit-runs" && file?.endsWith(".json") && !state) {
            return services.unitTests?.get(basename(file, ".json")).worktreeId === query.worktreeId
          }
          if (kind === "playwright-runs" && file?.endsWith(".json") && !state) {
            return services.captures?.get(basename(file, ".json")).worktreeId === query.worktreeId
          }
          if (kind === "environments" && file?.endsWith(".json")) {
            return (
              services.environments?.get(basename(file, ".json")).target.worktreeId ===
              query.worktreeId
            )
          }
        } catch {
          return false
        }
        return false
      },
    }
  }
  const target = await worktrees.resolve(query.worktreeId)
  roots.push({ path: target.worktree.checkoutRoot, kind: "checkout" })
  if (target.worktree.gitdir) {
    roots.push({ path: target.worktree.gitdir, kind: "git-private" })
  }
  const project = worktrees.getProject(target.worktree.projectId)
  if (project.location.kind === "git") {
    roots.push({ path: project.location.commonGitdir, kind: "git-shared" })
  }
  if (query.scope === "tests") {
    const data = runtime()
    roots.push({ path: target.settings.rulesRoot ?? target.worktree.projectRoot, kind: "checkout" })
    roots.push(
      { path: join(data, "submissions"), kind: "records" },
      { path: join(data, "runs"), kind: "records" },
    )
    return {
      roots,
      accepts(path: string) {
        const [kind, file, state] = relative(data, path).split(/[\\/]/)
        try {
          if (kind === "submissions") {
            return (
              Boolean(file?.endsWith(".json")) &&
              services.submissions.get(basename(file, ".json")).worktreeId === query.worktreeId
            )
          }
          if (kind === "runs") {
            return (
              state === "state.json" &&
              services.runs.get(file).target?.worktreeId === query.worktreeId
            )
          }
        } catch {
          return false
        }
        return roots
          .filter((root) => root.kind !== "records")
          .some((root) => {
            const local = relative(root.path, path)
            return local !== ".." && !local.startsWith("../")
          })
      },
    }
  }
  if (query.scope === "unit") {
    roots.push({ path: join(runtime(), "unit-runs"), kind: "records" })
    roots.push({ path: target.settings.rulesRoot ?? target.worktree.projectRoot, kind: "checkout" })
  }
  if (query.scope === "preview") {
    roots.push({ path: target.settings.rulesRoot ?? target.worktree.projectRoot, kind: "checkout" })
    const captures = join(runtime(), "playwright-runs")
    const environments = join(runtime(), "environments")
    roots.push({ path: join(runtime(), "playwright-runs"), kind: "records" })
    roots.push({ path: environments, kind: "records" })
    return {
      roots,
      accepts(path: string) {
        const captured = relative(captures, path)
        if (captured !== ".." && !captured.startsWith("../")) {
          if (!/^[^/]+\.json$/.test(captured)) {
            return false
          }
          try {
            return (
              services.captures?.get(basename(captured, ".json")).worktreeId === query.worktreeId
            )
          } catch {
            return false
          }
        }
        if (!relative(environments, path).startsWith("..")) {
          try {
            return (
              services.environments?.get(basename(path, ".json")).target.worktreeId ===
              query.worktreeId
            )
          } catch {
            return false
          }
        }
        return true
      },
    }
  }
  return { roots, accepts: () => true }
}
