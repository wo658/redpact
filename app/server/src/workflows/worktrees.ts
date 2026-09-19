import { randomUUID } from "node:crypto"
import { lstat, realpath, stat } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative } from "node:path"
import { defaultIntegrationSelection } from "../core/integration-defaults.js"
import { problem } from "../core/problems.js"
import { testSelectionSchema } from "../core/settings-schema.js"
import type { ProjectRecord, Store, Worktree } from "../core/types/contracts.js"
import type { GitAdapter, GitDiff, GitScope, GitService } from "../core/types/git.js"
import type { PreferenceFiles } from "../core/types/preferences.js"
import type {
  ProjectSettingsService,
  WorktreeAdmission,
  WorktreeService,
} from "../core/types/services.js"
import type { SettingsService, TestSelection } from "../core/types/settings.js"

export function createWorktrees(deps: {
  store: Store
  preferences: PreferenceFiles
  git: Pick<GitAdapter, "metadata" | "primaryRoot" | "listWorktrees" | "currentBranch" | "isMerged">
  projects: ProjectSettingsService
  gitService(path: string): GitService
  initializeSettings(root: string): Promise<void>
  settings(path: string, rulesRoot?: string): SettingsService
}): WorktreeService {
  const pendingLists = new Map<string, Promise<Worktree[]>>()
  const pendingDiffs = new Map<string, Promise<GitDiff>>()
  const diffTails = new Map<string, Promise<GitDiff>>()
  // Serialize identity publication against run acceptance.
  let tail: Promise<unknown> = Promise.resolve()
  function exclusive<T>(operation: (admission: WorktreeAdmission) => Promise<T> | T): Promise<T> {
    const result = tail.then(() => operation({ ensure }))
    tail = result.catch(() => {})
    return result
  }
  async function directory(path: string) {
    try {
      const canonical = await realpath(path)
      if (!(await stat(canonical)).isDirectory()) {
        throw new Error("Not a directory")
      }
      return canonical
    } catch {
      return problem("worktree_unavailable", `Directory is unavailable: ${path}`)
    }
  }
  async function hasGitMarker(path: string) {
    let current = path
    while (true) {
      try {
        await lstat(join(current, ".git"))
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          problem("worktree_unavailable", "Cannot inspect Git metadata")
        }
      }
      const parent = dirname(current)
      if (parent === current) {
        return false
      }
      current = parent
    }
  }
  function inside(root: string, path: string) {
    const value = relative(root, path)
    if (value === ".." || value.startsWith("../") || isAbsolute(value)) {
      problem("project_mismatch", "Project path escapes its checkout")
    }
    return value || "."
  }
  function getProject(id: string) {
    return deps.store.getProject(id) ?? problem("not_found", "Project not found")
  }
  function getWorktree(id: string) {
    return deps.store.getWorktree(id) ?? problem("not_found", "Worktree not found")
  }
  async function refreshProject(project: ProjectRecord) {
    if (project.location.kind !== "directory") {
      return project
    }
    let location: ProjectRecord["location"]
    try {
      const root = await directory(project.location.root)
      const git = await deps.git.metadata(root)
      if (!git.available) {
        return project
      }
      location = {
        kind: "git",
        commonGitdir: git.commonGitdir,
        projectPath: inside(git.root, root),
      }
      await primaryProjectRoot(location.commonGitdir, location.projectPath)
    } catch {
      // An unavailable directory or incomplete git init must not hide the project.
      return project
    }
    if (
      deps.store
        .listProjects()
        .some(
          (item) =>
            item.id !== project.id && JSON.stringify(item.location) === JSON.stringify(location),
        )
    ) {
      return project
    }
    const promoted = { ...project, location }
    deps.store.promoteProject(promoted)
    return promoted
  }
  async function inspect(project: ProjectRecord, path: string) {
    const root = await directory(path)
    if (project.location.kind === "directory") {
      if (root !== project.location.root) {
        problem("project_mismatch", "Directory project requires its original root")
      }
      return { checkoutRoot: root, projectRoot: root, gitdir: null }
    }
    const git = await deps.git.metadata(root)
    if (!git.available || git.commonGitdir !== project.location.commonGitdir) {
      problem("project_mismatch", "Checkout belongs to a different or unavailable repository")
    }
    const checkoutRoot = await directory(git.root)
    const projectRoot = await directory(join(checkoutRoot, project.location.projectPath))
    inside(checkoutRoot, projectRoot)
    return { checkoutRoot, projectRoot, gitdir: git.gitdir }
  }
  async function primaryProjectRoot(commonGitdir: string, projectPath: string) {
    const checkout = await deps.git.primaryRoot(commonGitdir)
    const root = await directory(join(checkout, projectPath))
    inside(checkout, root)
    return root
  }
  async function settingsForPath(path: string) {
    const root = await directory(path)
    const git = await deps.git.metadata(root)
    if (!git.available) {
      if (await hasGitMarker(root)) {
        return problem("worktree_unavailable", "Cannot resolve project Git metadata")
      }
      return deps.settings(root)
    }
    const rulesRoot = await primaryProjectRoot(git.commonGitdir, inside(git.root, root))
    return deps.settings(root, rulesRoot)
  }
  async function projectSettings(id: string) {
    return deps.settings(await deps.projects.root(id))
  }
  async function resolve(id: string): ReturnType<WorktreeService["resolve"]> {
    const worktree = getWorktree(id)
    const actual = await inspect(getProject(worktree.projectId), worktree.checkoutRoot)
    if (
      actual.checkoutRoot !== worktree.checkoutRoot ||
      actual.projectRoot !== worktree.projectRoot ||
      actual.gitdir !== worktree.gitdir
    ) {
      problem(
        "worktree_unavailable",
        "Worktree identity changed; discover the current checkout before execution",
      )
    }
    const git = deps.gitService(worktree.projectRoot)
    return {
      worktree,
      settings: deps.settings(
        worktree.projectRoot,
        (await projectSettings(worktree.projectId)).projectRoot,
      ),
      git: {
        ...git,
        async mergeBase() {
          return git.mergeBase((await deps.projects.tracking(worktree.projectId)).mainBranch)
        },
        async image(path, _mainBranch, options) {
          const tracking = await deps.projects.tracking(worktree.projectId)
          return git.image(path, tracking.mainBranch, options)
        },
        diff: (scope) => readDiff(worktree, git, scope),
      },
    }
  }
  function readDiff(worktree: Worktree, git: GitService, scope: GitScope) {
    const key = JSON.stringify([worktree.id, scope])
    const pending = pendingDiffs.get(key)
    if (pending) {
      return pending
    }
    // Callers arriving during a read share one subsequent read of current files.
    const result = (diffTails.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        pendingDiffs.delete(key)
        const tracking = await deps.projects.tracking(worktree.projectId)
        return git.diff(scope, tracking.mainBranch)
      })
    pendingDiffs.set(key, result)
    diffTails.set(key, result)
    const cleanup = () => {
      if (diffTails.get(key) === result) {
        diffTails.delete(key)
      }
    }
    void result.then(cleanup, cleanup)
    return result
  }
  async function ensure(projectId: string, path: string, managed?: { id: string }) {
    const actual = await inspect(getProject(projectId), path)
    const previous = deps.store
      .listWorktrees()
      .find(
        (item) =>
          item.projectId === projectId &&
          item.checkoutRoot === actual.checkoutRoot &&
          item.projectRoot === actual.projectRoot &&
          item.gitdir === actual.gitdir,
      )
    if (previous) {
      return previous
    }
    const worktree: Worktree = {
      ...actual,
      id: managed?.id ?? randomUUID(),
      projectId,
      createdAt: new Date().toISOString(),
    }
    deps.store.saveWorktree(worktree)
    return worktree
  }
  async function discover(projectId: string, commonGitdir: string) {
    const known = deps.store.listWorktrees().filter((item) => item.projectId === projectId)
    const reserved = new Set(
      deps.store
        .listWorkStarts()
        .filter((request) => request.input.projectId === projectId && request.state !== "completed")
        .map((request) => request.checkoutRoot),
    )
    const current = new Set<string>()
    const paths = await deps.git.listWorktrees(commonGitdir)
    for (const path of paths) {
      try {
        const canonical = await directory(path)
        current.add(canonical)
        // Discovery must not claim an ID reserved by a recoverable managed creation.
        if (reserved.has(canonical)) {
          continue
        }
        const existing = known.filter((item) => item.checkoutRoot === canonical)
        if (
          (await Promise.all(existing.map((item) => available(getProject(projectId), item)))).some(
            Boolean,
          )
        ) {
          continue
        }
        await ensure(projectId, canonical)
      } catch (error) {
        // Missing subprojects and stale Git entries must not hide valid checkouts.
        const code = (error as { code?: string }).code
        if (code !== "worktree_unavailable" && code !== "project_mismatch") {
          throw error
        }
      }
    }
    return current
  }
  async function available(project: ProjectRecord, item: Worktree) {
    try {
      const target = await inspect(project, item.checkoutRoot)
      return target.projectRoot === item.projectRoot && target.gitdir === item.gitdir
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === "worktree_unavailable" || code === "project_mismatch") {
        return false
      }
      throw error
    }
  }
  async function visibleWorktrees(project: ProjectRecord, current?: Set<string>) {
    const items = deps.store.listWorktrees().filter((item) => item.projectId === project.id)
    const tracking = await deps.projects.tracking(project.id)
    const visible = await Promise.all(
      items.map(async (item) => {
        if (current && !current.has(item.checkoutRoot)) {
          return false
        }
        if (!(await available(project, item))) {
          return false
        }
        if (project.location.kind !== "git" || !tracking?.hideMerged || !tracking.mainBranch) {
          return true
        }
        try {
          return !(await deps.git.isMerged(item.checkoutRoot, tracking.mainBranch))
        } catch {
          // A failed merge check is not evidence of a completed merge.
          return true
        }
      }),
    )
    return Promise.all(
      items
        .filter((_item, index) => visible[index])
        .map(async (item) => {
          if (project.location.kind !== "git") {
            return item
          }
          return {
            ...item,
            branch: await deps.git.currentBranch(item.projectRoot).catch(() => null),
          }
        }),
    )
  }
  const service = {
    exclusive,
    async getIntegrationDefaults(projectId: string) {
      const settings = await projectSettings(projectId)
      const selection = await deps.preferences.integrationDefaults(settings.projectRoot)
      if (selection) {
        return { selection, saved: true }
      }
      const result = await settings.read()
      if (!result.valid || !result.settings) {
        throw Object.assign(new Error("Project settings are invalid"), {
          code: "settings_invalid",
          validation: result,
        })
      }
      return {
        selection: defaultIntegrationSelection(result.settings, result.containers ?? []),
        saved: false,
      }
    },
    async setIntegrationDefaults(projectId: string, input: TestSelection) {
      const selection = testSelectionSchema.parse(input)
      const settings = await projectSettings(projectId)
      const validation = await settings.read(selection)
      if (!validation.valid) {
        throw Object.assign(new Error("Project integration defaults are invalid"), {
          code: "settings_invalid",
          validation,
        })
      }
      await deps.preferences.saveIntegrationDefaults(settings.projectRoot, selection)
      return selection
    },
    async getSelection(id: string) {
      const { worktree } = await resolve(id)
      return deps.preferences.selection(
        worktree.projectRoot,
        deps.store.getWorktreeSelection(id)?.selection,
      )
    },
    async setSelection(id: string, input: TestSelection) {
      const selection = testSelectionSchema.parse(input)
      const target = await resolve(id)
      const validation = await target.settings.read(selection)
      if (!validation.valid) {
        throw Object.assign(
          new Error("Worktree selection is invalid; select available services and modes"),
          {
            code: "settings_invalid",
            validation,
          },
        )
      }
      await deps.preferences.saveSelection(target.worktree.projectRoot, selection)
      return selection
    },
    resolve,
    projectSettings,
    settingsForPath,
    getProject,
    getWorktree,
    listProjects: () =>
      exclusive(async () => {
        for (const project of deps.store.listProjects()) {
          await refreshProject(project)
        }
        return deps.store.listProjects()
      }),
    async checkoutPaths(projectId: string) {
      const project = await exclusive(() => refreshProject(getProject(projectId)))
      if (project.location.kind === "git") {
        return deps.git.listWorktrees(project.location.commonGitdir)
      }
      return [project.location.root]
    },
    listWorktrees(projectId: string) {
      const pending = pendingLists.get(projectId)
      if (pending) {
        return pending
      }
      const result = exclusive(async () => {
        pendingLists.delete(projectId)
        const project = await refreshProject(getProject(projectId))
        if (project.location.kind === "git") {
          const current = await discover(project.id, project.location.commonGitdir)
          return visibleWorktrees(project, current)
        }
        try {
          await ensure(project.id, project.location.root)
        } catch (error) {
          if ((error as { code?: string }).code !== "worktree_unavailable") {
            throw error
          }
        }
        return visibleWorktrees(project)
      })
      pendingLists.set(projectId, result)
      return result
    },
    connect(path: string, name?: string) {
      return exclusive(async () => {
        const root = await directory(path)
        const git = await deps.git.metadata(root)
        if (!git.available && (await hasGitMarker(root))) {
          problem("worktree_unavailable", `Git inspection failed: ${git.reason}`)
        }
        const location: ProjectRecord["location"] = git.available
          ? { kind: "git", commonGitdir: git.commonGitdir, projectPath: inside(git.root, root) }
          : { kind: "directory", root }
        const rulesRoot =
          location.kind === "git"
            ? await primaryProjectRoot(location.commonGitdir, location.projectPath)
            : root
        await deps.initializeSettings(rulesRoot)
        for (const item of deps.store.listProjects()) {
          if (
            item.location.kind === "directory" &&
            (item.location.root === root || item.location.root === rulesRoot)
          ) {
            await refreshProject(item)
          }
        }
        const previous = deps.store
          .listProjects()
          .find((item) => JSON.stringify(item.location) === JSON.stringify(location))
        if (previous) {
          return previous
        }
        const project = {
          id: randomUUID(),
          name: name?.trim() || basename(root),
          location,
          createdAt: new Date().toISOString(),
        }
        deps.store.createProject(project)
        return project
      })
    },
    ensure(projectId: string, path: string) {
      return exclusive(() => ensure(projectId, path))
    },
  }
  return service
}
