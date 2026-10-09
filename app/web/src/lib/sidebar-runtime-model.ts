export type InstallationState = {
  state: "missing" | "installing" | "installed" | "failed"
  version: string
  manager?: "npm" | "pnpm"
  error: string
  logPath: string
  directory: string
}
export type RuntimeState = {
  state: "running" | "stopped" | "blocked"
  origin: string
  message: string
  dataDir: string
  logPath: string
  installation?: InstallationState
  owned: boolean
  startedPid?: number
}
