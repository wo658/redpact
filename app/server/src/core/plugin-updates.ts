import { gt, prerelease, valid } from "semver"
import { z } from "zod"
import type { PluginInstallation, PluginUpdateStatus } from "./types/plugin-updates.js"

export const pluginAgentSchema = z.enum(["codex", "claude"])
export const pluginUpdatesStateSchema = z.object({
  agents: z.array(
    z.object({
      agent: pluginAgentSchema,
      currentVersion: z.string().nullable(),
      latestVersion: z.string().nullable(),
      status: z.enum([
        "unchecked",
        "current",
        "available",
        "missing",
        "unsupported",
        "error",
        "updated",
      ]),
      error: z.string().nullable(),
    }),
  ),
  busy: z.boolean(),
  checkedAt: z.string().nullable(),
})

export function installationIssue(value: PluginInstallation): string | null {
  if (!value.supported) {
    return "This marketplace plugin source is not supported. Manage it in the agent."
  }
  if (value.scope !== "user" || !value.enabled) {
    return "Automatic updates require one enabled user installation. Use the agent to manage other scopes or disabled plugins."
  }
  if (!valid(value.version)) {
    return "The installed plugin has no comparable semantic version."
  }
  return null
}

export function pluginVersionStatus(current: string, latest: string): PluginUpdateStatus["status"] {
  if (!valid(current) || !valid(latest) || prerelease(latest)) {
    throw new Error("The plugin version cannot be compared with a stable release.")
  }
  const currentBuild = /^(\d+\.\d+\.\d+)\+codex\.(\d{14})$/.exec(current)
  const latestBuild = /^(\d+\.\d+\.\d+)\+codex\.(\d{14})$/.exec(latest)
  if (currentBuild && latestBuild && currentBuild[1] === latestBuild[1]) {
    return latestBuild[2] > currentBuild[2] ? "available" : "current"
  }
  return gt(latest, current) ? "available" : "current"
}
