export type SettingsDocument = {
  file: string
  source: string | null
  revision: string | null
  value?: Record<string, unknown>
  issues: string[]
}
export type SettingsFiles = {
  read(root: string, path: string): Promise<{ source: string | null; revision: string | null }>
}
export type SettingsEditor = {
  project(id: string): Promise<SettingsDocument>
  instance(): Promise<SettingsDocument>
}
