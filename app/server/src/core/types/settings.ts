import type { z } from "zod"
import type { executionSettingsSchema } from "../execution-settings.js"
import type { containerBinding, settingsSchema, testSelectionSchema } from "../settings-schema.js"
import type { EnvironmentPlan } from "./environment-plan.js"
export type SettingsIssue = {
  code: string
  path: string
  message: string
  line?: number
  column?: number
  file?: string
  related?: SettingsIssue[]
}
export type ComposeSettings = z.infer<typeof executionSettingsSchema>
export type Settings = z.infer<typeof settingsSchema>
export type TestSelection = z.infer<typeof testSelectionSchema>
export type ContainerBinding = z.infer<typeof containerBinding>
export type SettingsResult = {
  valid: boolean
  file: string
  issues: SettingsIssue[]
  settings?: Settings
  source?: string
  projectRules?: { file: string; source: string; override?: { file: string; source: string } }
  promotion?: { file: string; baseSha256: string; overrideSha256: string; source: string }
  digest?: string
  bundle?: { files: { path: string; sha256: string; source: string }[] }
  plan?: EnvironmentPlan
  containers?: string[]
}
export type SettingsService = {
  projectRoot: string
  rulesRoot?: string
  read(selection?: TestSelection): Promise<SettingsResult>
}

export type WorktreeSelection = { id: string; selection: TestSelection; updatedAt: string }
