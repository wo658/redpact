export type PluginAgent = "codex" | "claude"
export type PluginInstallation = {
  version: string
  enabled: boolean
  scope: string
  supported: boolean
  id: string
  sourceKey: string
}
export type PluginUpdateStatus = {
  agent: PluginAgent
  currentVersion: string | null
  latestVersion: string | null
  status: "unchecked" | "current" | "available" | "missing" | "unsupported" | "error" | "updated"
  error: string | null
}
export type PluginUpdatesState = {
  agents: PluginUpdateStatus[]
  busy: boolean
  checkedAt: string | null
}
export type PluginClient = {
  inspect(agent: PluginAgent, cliPath?: string): Promise<PluginInstallation | null>
  latest(agent: PluginAgent, cliPath?: string): Promise<string>
  install(agent: PluginAgent, version: string, cliPath?: string, sourceKey?: string): Promise<void>
}
export type PluginUpdates = {
  status(): PluginUpdatesState
  check(): Promise<PluginUpdatesState>
  install(agent: PluginAgent, version: string): Promise<PluginUpdatesState>
}
