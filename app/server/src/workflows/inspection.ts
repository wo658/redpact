import { problem } from "../core/problems.js"
import { describeSettings, publicSettings } from "../core/settings.js"
import type { GitImageOptions, GitScope } from "../core/types/git.js"
import type { WorktreeService } from "../core/types/services.js"
import type { TestSelection } from "../core/types/settings.js"
import { readDependencies } from "./dependencies.js"
import type { Services } from "./services.js"

export function createDefaultInspection(
  services: Pick<Services, "settings" | "git" | "worktrees" | "defaultWorktreeId">,
) {
  async function target(kind: "settings" | "Git") {
    if (services.worktrees && !services.defaultWorktreeId) {
      problem("target_required", `Use the worktree ${kind} route`)
    }
    return services.defaultWorktreeId
      ? (
          services.worktrees ?? problem("worktree_unavailable", "Worktree service is not connected")
        ).resolve(services.defaultWorktreeId)
      : undefined
  }
  return {
    specification: describeSettings,
    health: () => ({ status: "ok", git: services.git ? "connected" : "not_connected" }),
    async settings() {
      const resolved = await target("settings")
      return publicSettings(await (resolved?.settings ?? services.settings).read())
    },
    async git() {
      const resolved = await target("Git")
      return (
        (await (resolved?.git ?? services.git)?.inspect()) ?? {
          available: false,
          reason: "Git adapter is not connected",
        }
      )
    },
  }
}

export function createWorktreeInspection(service: WorktreeService) {
  return {
    async projectDependencies(projectId: string) {
      const result = await readDependencies(await service.projectSettings(projectId))
      return { ...result, projectId }
    },
    async settings(id: string) {
      const target = await service.resolve(id)
      const result = publicSettings(await target.settings.read())
      return { ...result, worktreeId: target.worktree.id, projectId: target.worktree.projectId }
    },
    async dependencies(id: string, dependency?: string, selection?: TestSelection) {
      const target = await service.resolve(id)
      const result = await readDependencies(target.settings, { dependency }, selection)
      return { ...result, worktreeId: target.worktree.id, projectId: target.worktree.projectId }
    },
    async image(id: string, path: string, options?: GitImageOptions) {
      return (await service.resolve(id)).git.image(path, undefined, options)
    },
    async diff(id: string, scope: GitScope) {
      return (await service.resolve(id)).git.diff(scope)
    },
    async git(id: string) {
      return (await service.resolve(id)).git.inspect()
    },
  }
}
