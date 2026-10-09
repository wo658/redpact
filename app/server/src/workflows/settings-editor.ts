import { join } from "node:path"
import { parseDocument } from "yaml"
import type { z } from "zod"
import { instanceSettingsSchema } from "../core/instance-schema.js"
import { settingsSchema } from "../core/settings-schema.js"
import type { ProjectSettingsService } from "../core/types/services.js"
import type { SettingsEditor, SettingsFiles } from "../core/types/settings-editor.js"

function parse(source: string, schema: z.ZodType<Record<string, unknown>>) {
  if (Buffer.byteLength(source) > 256 * 1024) {
    throw new Error("Settings must not exceed 256 KiB")
  }
  const json: unknown = JSON.parse(source)
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length || document.warnings.length) {
    throw new Error("Invalid JSON or duplicate keys")
  }
  return schema.parse(json)
}
export function createSettingsEditor(deps: {
  projects: Pick<ProjectSettingsService, "root">
  directory: string
  files: SettingsFiles
}): SettingsEditor {
  async function read(root: string, path: string, schema: z.ZodType<Record<string, unknown>>) {
    const snapshot = await deps.files.read(root, path)
    const result = { file: join(root, path), ...snapshot, issues: [] as string[] }
    if (snapshot.source === null) {
      return result
    }
    try {
      return { ...result, value: parse(snapshot.source, schema) }
    } catch (error) {
      return { ...result, issues: [error instanceof Error ? error.message : "Invalid settings"] }
    }
  }
  return {
    async project(id) {
      return read(await deps.projects.root(id), ".redpact/settings.json", settingsSchema)
    },
    async instance() {
      return read(deps.directory, "settings.json", instanceSettingsSchema)
    },
  }
}
