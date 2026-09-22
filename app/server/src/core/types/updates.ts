export type UpdateStatus = {
  currentVersion: string
  version: string | null
  busy: boolean
  checkedAt: string | null
  error: string | null
  canInstall: boolean
  installError: string | null
  supported: boolean
}
export type Updates = {
  status(): UpdateStatus
  check(): Promise<UpdateStatus>
  install(version: string): Promise<{ accepted: true }>
}
