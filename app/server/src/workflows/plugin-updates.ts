import { instanceSettingsSchema } from "../core/instance-schema.js"
import { installationIssue, pluginVersionStatus } from "../core/plugin-updates.js"
import { problem } from "../core/problems.js"
import type {
  PluginAgent,
  PluginClient,
  PluginUpdateStatus,
  PluginUpdates,
  PluginUpdatesState,
} from "../core/types/plugin-updates.js"
import type { SettingsEditor } from "../core/types/settings-editor.js"

const agents: PluginAgent[] = ["codex", "claude"]
export function createPluginUpdates(deps: {
  client: PluginClient
  settings: Pick<SettingsEditor, "instance">
  now(): string
}): PluginUpdates {
  const state: PluginUpdatesState = {
    agents: agents.map((agent) => ({
      agent,
      currentVersion: null,
      latestVersion: null,
      status: "unchecked",
      error: null,
    })),
    busy: false,
    checkedAt: null,
  }
  let checkedPaths: Partial<Record<PluginAgent, string | undefined>> = {}
  const status = () => structuredClone(state)
  async function paths() {
    const document = await deps.settings.instance()
    if (document.issues.length) {
      throw new Error("Fix global settings before checking plugins.")
    }
    return instanceSettingsSchema.parse(document.value ?? {}).agents ?? {}
  }
  async function inspect(agent: PluginAgent, cliPath?: string): Promise<PluginUpdateStatus> {
    const row: PluginUpdateStatus = {
      agent,
      currentVersion: null,
      latestVersion: null,
      status: "missing",
      error: null,
    }
    try {
      const installed = await deps.client.inspect(agent, cliPath)
      if (!installed) {
        return row
      }
      row.currentVersion = installed.version
      const issue = installationIssue(installed)
      if (issue) {
        return { ...row, status: "unsupported", error: issue }
      }
      row.latestVersion = await deps.client.latest(agent)
      row.status = pluginVersionStatus(installed.version, row.latestVersion)
      return row
    } catch (error) {
      return {
        ...row,
        status: "error",
        error: error instanceof Error ? error.message : "Plugin check failed.",
      }
    }
  }
  return {
    status,
    async check() {
      if (state.busy) {
        return status()
      }
      state.busy = true
      try {
        const settings = await paths()
        checkedPaths = Object.fromEntries(agents.map((agent) => [agent, settings[agent]?.cliPath]))
        state.agents = await Promise.all(agents.map((agent) => inspect(agent, checkedPaths[agent])))
      } catch (error) {
        state.agents = agents.map((agent) => ({
          agent,
          currentVersion: null,
          latestVersion: null,
          status: "error",
          error: error instanceof Error ? error.message : "Plugin check failed.",
        }))
      } finally {
        state.busy = false
        state.checkedAt = deps.now()
      }
      return status()
    },
    async install(agent, version) {
      const selected = state.agents.find((row) => row.agent === agent)
      if (state.busy || selected?.status !== "available" || selected.latestVersion !== version) {
        problem("worktree_busy", "Plugin update changed. Check again before installing.")
      }
      state.busy = true
      try {
        const settings = await paths()
        const cliPath = settings[agent]?.cliPath
        if (cliPath !== checkedPaths[agent]) {
          throw new Error("CLI path changed. Check again before installing.")
        }
        const current = await inspect(agent, cliPath)
        if (
          current.status !== "available" ||
          current.latestVersion !== version ||
          current.currentVersion !== selected.currentVersion
        ) {
          throw new Error("Plugin update changed. Check again before installing.")
        }
        await deps.client.install(agent, version, cliPath)
        const installed = await deps.client.inspect(agent, cliPath)
        if (!installed || installationIssue(installed) || installed.version !== version) {
          throw new Error(
            "The requested plugin version was not confirmed. Check the agent before retrying.",
          )
        }
        Object.assign(selected, {
          currentVersion: installed.version,
          status: "updated",
          error: null,
        })
      } catch (error) {
        Object.assign(selected, {
          status: "error",
          error: error instanceof Error ? error.message : "Plugin update failed.",
        })
      } finally {
        state.busy = false
        state.checkedAt = deps.now()
      }
      return status()
    },
  }
}
