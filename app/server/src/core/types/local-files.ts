import type { SourceFile } from "./contracts.js"
import type { SettingsService } from "./settings.js"

export type LocalFiles = {
  settings(path: string): SettingsService | Promise<SettingsService>
  readTests(root: string, directory: string, tests?: string[]): Promise<SourceFile[]>
}
