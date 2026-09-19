import { realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import { problem } from "../core/problems.js"
import { trackingSchema } from "../core/tracking-schema.js"
import type { Store } from "../core/types/contracts.js"
import type { GitAdapter } from "../core/types/git.js"
import type { PreferenceFiles } from "../core/types/preferences.js"
import type { ProjectSettingsService } from "../core/types/services.js"

export function createProjectSettings(deps: {
  preferences: PreferenceFiles
  store: Pick<Store, "getProject">
  git: Pick<
    GitAdapter,
    "primaryRoot" | "currentBranch" | "listBranches" | "branchReviews" | "branchDiff"
  >
}): ProjectSettingsService {
  const project = (id: string) =>
    deps.store.getProject(id) ?? problem("not_found", "Project not found")
  async function root(id: string) {
    const { location } = project(id)
    try {
      if (location.kind === "directory") {
        const path = await realpath(location.root)
        if (!(await stat(path)).isDirectory()) {
          throw new Error("Project directory unavailable")
        }
        return path
      }
      const checkout = await deps.git.primaryRoot(location.commonGitdir)
      const path = await realpath(join(checkout, location.projectPath))
      const rel = relative(checkout, path)
      if (
        isAbsolute(rel) ||
        rel === ".." ||
        rel.startsWith("../") ||
        !(await stat(path)).isDirectory()
      ) {
        problem("project_mismatch", "Project path escapes its checkout")
      }
      return path
    } catch (error) {
      if ((error as { code?: string }).code === "project_mismatch") {
        throw error
      }
      return problem("worktree_unavailable", "The project's primary directory is unavailable")
    }
  }
  async function tracking(id: string, projectRoot?: string) {
    const saved = project(id)
    let path: string
    try {
      path = projectRoot ?? (await root(id))
    } catch (error) {
      if ((error as { code?: string }).code !== "worktree_unavailable") {
        throw error
      }
      return saved.tracking ?? { mainBranch: null, hideMerged: false }
    }
    const value = await deps.preferences.tracking(path, saved.tracking)
    if (value) {
      return value
    }
    if (saved.location.kind === "git") {
      try {
        const mainBranch = await deps.git.currentBranch(path)
        return { mainBranch, hideMerged: mainBranch !== null }
      } catch {
        // Without a comparison branch, merge exclusion cannot be established.
      }
    }
    return { mainBranch: null, hideMerged: false }
  }
  return {
    root,
    tracking,
    async read(id) {
      const projectRoot = await root(id)
      return { projectRoot, tracking: await tracking(id, projectRoot) }
    },
    async branches(id) {
      const { location } = project(id)
      return location.kind === "git" ? deps.git.listBranches(location.commonGitdir) : []
    },
    async branchReviews(id) {
      if (project(id).location.kind !== "git") {
        return []
      }
      const value = await tracking(id)
      const rows = await deps.git.branchReviews(await root(id), value.mainBranch)
      return rows.filter(
        (row) => !value.hideMerged || !row.merged || row.worktrees.some((w) => !w.missing),
      )
    },
    async branchDiff(id, branch) {
      const saved = project(id)
      if (
        saved.location.kind !== "git" ||
        !(await deps.git.listBranches(saved.location.commonGitdir)).includes(branch)
      ) {
        problem("not_found", "Local branch not found")
      }
      return deps.git.branchDiff(await root(id), branch, (await tracking(id)).mainBranch)
    },
    async update(id, input) {
      const parsed = trackingSchema.safeParse(input)
      if (!parsed.success) {
        problem("invalid_input", parsed.error.message)
      }
      const saved = project(id)
      if (saved.location.kind !== "git") {
        problem("invalid_input", "Tracking preferences require a Git project")
      }
      const branches = await deps.git.listBranches(saved.location.commonGitdir)
      if (parsed.data.mainBranch && !branches.includes(parsed.data.mainBranch)) {
        problem("invalid_input", "Main branch must be an existing local branch")
      }
      const updated = { ...project(id), tracking: parsed.data }
      await deps.preferences.saveTracking(await root(id), parsed.data)
      return updated
    },
  }
}
