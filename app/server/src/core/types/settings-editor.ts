import type { SettingsResult } from "./settings.js"
export type SettingsEdit = { source: string; revision: string | null }
export type SettingsDocument = {
  file: string
  source: string | null
  revision: string | null
  value?: Record<string, unknown>
  issues: string[]
}
export type SettingsFiles = {
  read(root: string, path: string): Promise<{ source: string | null; revision: string | null }>
  write(root: string, path: string, input: SettingsEdit): Promise<void>
}
export type SettingsEditor = {
  project(id: string): Promise<SettingsDocument>
  saveProject(id: string, input: SettingsEdit): Promise<SettingsDocument>
  instance(): Promise<SettingsDocument>
  saveInstance(input: SettingsEdit): Promise<SettingsDocument>
}
export type ProjectSettingsValidation = (root: string, source: string) => Promise<SettingsResult>
