import { join } from "node:path"
import { parseDocument } from "yaml"
import type { z } from "zod"
import { instanceSettingsSchema } from "../core/instance-schema.js"
import { problem } from "../core/problems.js"
import { settingsSchema } from "../core/settings-schema.js"
import type { ProjectSettingsService } from "../core/types/services.js"
import type {
  ProjectSettingsValidation,
  SettingsEditor,
  SettingsFiles,
} from "../core/types/settings-editor.js"

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
  validateProject: ProjectSettingsValidation
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
  function validate(source: string, schema: z.ZodType<Record<string, unknown>>) {
    try {
      parse(source, schema)
    } catch (error) {
      problem("invalid_input", error instanceof Error ? error.message : "Invalid settings")
    }
  }
  return {
    async project(id) {
      return read(await deps.projects.root(id), ".redpact/settings.json", settingsSchema)
    },
    async saveProject(id, input) {
      const root = await deps.projects.root(id)
      validate(input.source, settingsSchema)
      const validation = await deps.validateProject(root, input.source)
      if (!validation.valid) {
        throw Object.assign(new Error("Project settings are invalid"), {
          code: "settings_invalid",
          validation,
        })
      }
      await deps.files.write(root, ".redpact/settings.json", input)
      return read(root, ".redpact/settings.json", settingsSchema)
    },
    async instance() {
      return read(deps.directory, "settings.json", instanceSettingsSchema)
    },
    async saveInstance(input) {
      validate(input.source, instanceSettingsSchema)
      await deps.files.write(deps.directory, "settings.json", input)
      return read(deps.directory, "settings.json", instanceSettingsSchema)
    },
  }
}
