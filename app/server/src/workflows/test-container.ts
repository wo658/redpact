import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { problem } from "../core/problems.js"
import type { EnvironmentAdapter } from "../core/types/environment.js"
import type { ProjectEntry } from "../core/types/project-files.js"
import type {
  EnvironmentService,
  ProjectSettingsService,
  StopEnvironment,
  WorktreeService,
} from "../core/types/services.js"
import type { TestContainer, TestContainerInspection } from "../core/types/test-container.js"

export function createTestContainer(deps: {
  worktrees: WorktreeService
  projects: ProjectSettingsService
  environments: EnvironmentService
  stopEnvironment: StopEnvironment
  fingerprint: EnvironmentAdapter["fingerprint"]
  readFile: (root: string, path: string) => Promise<ProjectEntry>
}): TestContainer {
  const pending = new Map<string, Promise<TestContainerInspection>>()
  let closing = false
  function current(projectId: string, worktreeId?: string) {
    return (
      deps.environments
        .temporary()
        .find(
          (env) =>
            env.lifecycle === "manual" &&
            env.target.projectId === projectId &&
            (worktreeId ? env.target.worktreeId === worktreeId : env.manualScope !== "worktree"),
        ) ?? null
    )
  }
  async function target(projectId: string, worktreeId?: string) {
    if (worktreeId) {
      const worktree = deps.worktrees.getWorktree(worktreeId)
      if (worktree.projectId !== projectId) {
        problem("invalid_input", "Worktree belongs to another project")
      }
      return worktree
    }
    const worktrees = await deps.worktrees.listWorktrees(projectId)
    const project = deps.worktrees.getProject(projectId)
    if (project.location.kind !== "git") {
      const root = project.location.root
      return worktrees.find((worktree) => worktree.projectRoot === root) ?? null
    }
    const { mainBranch } = await deps.projects.tracking(projectId)
    return worktrees.find((worktree) => mainBranch && worktree.branch === mainBranch) ?? null
  }
  async function inspect(projectId: string, worktreeId?: string): Promise<TestContainerInspection> {
    deps.worktrees.getProject(projectId)
    const selected = await target(projectId, worktreeId)
    const record = current(projectId, selected?.id ?? worktreeId)
    const environment = record ? await deps.environments.refresh(record.id) : null
    const result: TestContainerInspection = {
      composeFiles: [],
      target: null,
      environment,
      changed: null,
      issue: null,
    }
    try {
      result.target = selected
      if (!result.target) {
        result.issue = "The main branch has no available worktree."
        return result
      }
      const resolved = await deps.worktrees.resolve(result.target.id)
      const configured = await resolved.settings.read()
      result.composeFiles = configured.settings?.composeFiles ?? []
      if (environment) {
        const { selection } = await deps.worktrees.getIntegrationDefaults(projectId)
        const validation = await resolved.settings.read(selection)
        if (!validation.valid || !validation.digest) {
          result.issue = "Fix the project environment settings before restarting."
          return result
        }
        result.changed =
          environment.target.worktreeId !== result.target.id ||
          environment.settingsDigest !== validation.digest ||
          !isDeepStrictEqual(environment.selection, selection) ||
          environment.inputDigest !==
            (await deps.fingerprint(result.target.projectRoot, environment))
      }
    } catch (error) {
      result.issue = error instanceof Error ? error.message : "Test Container inputs unavailable"
    }
    return result
  }
  async function start(projectId: string, worktreeId?: string) {
    const selected = await target(projectId, worktreeId)
    if (current(projectId, selected?.id ?? worktreeId)) {
      return inspect(projectId, worktreeId)
    }
    const worktree = await target(projectId, worktreeId)
    if (!worktree) {
      problem("worktree_unavailable", "The main branch has no available worktree.")
    }
    const { selection } = await deps.worktrees.getIntegrationDefaults(projectId)
    const resolved = await deps.worktrees.resolve(worktree.id)
    const validation = await resolved.settings.read(selection)
    if (!validation.valid || !validation.digest || !validation.plan) {
      problem("invalid_input", "Fix the project environment settings before starting.")
    }
    if (closing) {
      problem("closing", "Server is shutting down")
    }
    const main = await target(projectId)
    await deps.environments.prepare(
      worktree.id,
      randomUUID(),
      validation.digest,
      selection,
      null,
      undefined,
      main?.id === worktree.id ? "main" : "worktree",
    )
    return inspect(projectId, worktreeId)
  }
  async function stop(projectId: string, worktreeId?: string) {
    deps.worktrees.getProject(projectId)
    const selected = await target(projectId, worktreeId)
    const environment = current(projectId, selected?.id ?? worktreeId)
    if (environment) {
      await deps.stopEnvironment(environment.id)
      await deps.stopEnvironment.idle()
      if (deps.environments.get(environment.id).state !== "stopped") {
        problem("environment_conflict", "Cleanup failed; retry Stop before restarting.")
      }
    }
    return inspect(projectId, worktreeId)
  }
  // Project admission also covers omitted-main and explicit-worktree aliases.
  async function action(projectId: string, operation: () => Promise<TestContainerInspection>) {
    if (closing) {
      problem("closing", "Server is shutting down")
    }
    if (pending.has(projectId)) {
      problem("environment_conflict", "A Test Container operation is already in progress")
    }
    const promise = operation().finally(() => pending.delete(projectId))
    pending.set(projectId, promise)
    return promise
  }
  return {
    busy: (id) => pending.has(id),
    async composeSource(projectId, path, worktreeId) {
      const worktree = await target(projectId, worktreeId)
      if (!worktree) {
        problem("worktree_unavailable", "The main branch has no available worktree.")
      }
      const resolved = await deps.worktrees.resolve(worktree.id)
      const configured = await resolved.settings.read()
      if (!configured.settings?.composeFiles.includes(path)) {
        problem("invalid_input", "Only configured Compose files can be previewed")
      }
      return deps.readFile(worktree.projectRoot, path)
    },
    inspect,
    start: (id, worktreeId) => action(id, () => start(id, worktreeId)),
    stop: (id, worktreeId) => action(id, () => stop(id, worktreeId)),
    restart: (id, worktreeId) =>
      action(id, async () => {
        const next = await target(id, worktreeId)
        if (!next) {
          problem("worktree_unavailable", "The main branch has no available worktree.")
        }
        await stop(id, worktreeId)
        return start(id, worktreeId)
      }),
    async close() {
      closing = true
      await Promise.allSettled([...pending.values()])
    },
  }
}
