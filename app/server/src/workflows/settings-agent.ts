import { isAbsolute } from "node:path"
import jsonpatch from "fast-json-patch"
import { parseDocument } from "yaml"
import { z } from "zod"
import { instanceSettingsSchema } from "../core/instance-schema.js"
import { problem } from "../core/problems.js"
import { settingsSchema } from "../core/settings-schema.js"
import type { SettingsService } from "../core/types/settings.js"
import type { SettingsDocument, SettingsEditor } from "../core/types/settings-editor.js"

export const settingsTarget = z.strictObject({
  scope: z.enum(["project", "instance"]),
  path: z.string().max(4096).refine(isAbsolute).optional(),
})
const pointer = z
  .string()
  .max(4096)
  .refine((value) => value === "" || value.startsWith("/"))
const operation = z.union([
  z.strictObject({ op: z.enum(["add", "replace", "test"]), path: pointer, value: z.json() }),
  z.strictObject({ op: z.literal("remove"), path: pointer }),
])
export const settingsGet = settingsTarget.extend({ pointer: pointer.optional() })
export const settingsPatch = settingsTarget
  .extend({
    revision: z.string().min(1).optional(),
    create: z.literal(true).optional(),
    patch: z.array(operation).min(1).max(1000),
  })
  .refine(
    (value) => Boolean(value.revision) !== Boolean(value.create),
    "Supply revision or create, exclusively",
  )
export const settingsRepair = settingsTarget.extend({
  revision: z.string().min(1),
  value: z.record(z.string(), z.json()),
})
type Target = z.infer<typeof settingsTarget>

function tokens(path: string) {
  if (/(~[^01]|~$)/.test(path)) {
    problem("invalid_input", "Invalid JSON Pointer escape")
  }
  const parts =
    path === ""
      ? []
      : path
          .slice(1)
          .split("/")
          .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
  if (parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
    problem("invalid_input", "Unsafe settings pointer")
  }
  return parts
}
function authored(document: SettingsDocument): unknown {
  if (document.source === null) {
    return null
  }
  try {
    const value: unknown = JSON.parse(document.source)
    const parsed = parseDocument(document.source, { uniqueKeys: true })
    if (parsed.errors.length || parsed.warnings.length) {
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}
function selected(value: unknown, path: string) {
  let current = value
  for (const part of tokens(path)) {
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, part)) {
      problem("not_found", "Settings pointer does not exist")
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
function revision(document: SettingsDocument, expected: string | null) {
  if (document.revision !== expected) {
    problem("environment_conflict", "Settings changed. Reload before saving.")
  }
}
function safeIssues(document: SettingsDocument) {
  return document.issues.length ? ["Stored settings are invalid; validate for diagnostics"] : []
}
export function createSettingsAgent(deps: {
  editor: SettingsEditor
  settings(path: string): SettingsService | Promise<SettingsService>
}) {
  async function context(input: Target) {
    if (input.scope === "instance") {
      if (input.path) {
        problem("invalid_input", "Instance settings do not take a project path")
      }
      return { document: await deps.editor.instance(), service: undefined }
    }
    if (!input.path) {
      problem("target_required", "Supply the execution checkout path")
    }
    const service = await deps.settings(input.path)
    return {
      document: await deps.editor.projectAt(service.rulesRoot ?? service.projectRoot),
      service,
    }
  }
  async function save(input: Target, document: SettingsDocument, value: unknown, backup = false) {
    const schema = input.scope === "project" ? settingsSchema : instanceSettingsSchema
    if (!schema.safeParse(value).success) {
      problem("invalid_input", "Candidate settings fail schema validation")
    }
    const edit = {
      source: `${JSON.stringify(value, null, 2)}\n`,
      revision: document.revision,
      ...(backup ? { backup: true } : {}),
    }
    let saved: SettingsDocument
    try {
      if (input.scope === "project") {
        const service = await deps.settings(
          input.path ?? problem("target_required", "Supply the execution checkout path"),
        )
        saved = await deps.editor.saveProjectAt(
          service.rulesRoot ?? service.projectRoot,
          edit,
          service.projectRoot,
        )
      } else {
        saved = await deps.editor.saveInstance(edit)
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "settings_invalid"
      ) {
        const details = error as { validation?: { issues?: { code: string; path: string }[] } }
        throw Object.assign(new Error("Candidate execution settings are invalid"), {
          code: "settings_invalid",
          validation: {
            valid: false,
            file: document.file,
            issues: details.validation?.issues?.map(({ code, path }) => ({ code, path })) ?? [],
          },
        })
      }
      throw error
    }

    return {
      scope: input.scope,
      file: saved.file,
      revision: saved.revision,
      saved: true,
      ...(backup ? { backupFile: `${document.file}.repair-${document.revision}.bak` } : {}),
    }
  }
  return {
    async describe(input: Target) {
      const { document, service } = await context(settingsTarget.parse(input))
      const schema = input.scope === "project" ? settingsSchema : instanceSettingsSchema
      return {
        scope: input.scope,
        file: document.file,
        revision: document.revision,
        ...(service
          ? {
              projectRoot: service.projectRoot,
              rulesRoot: service.rulesRoot ?? service.projectRoot,
            }
          : {}),
        schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
        defaults: schema.parse({}),
        writable: Object.keys(schema.shape)
          .filter((key) => input.scope !== "instance" || !["approval", "github"].includes(key))
          .map((key) => `/${key}`),
        protected: input.scope === "instance" ? ["/approval", "/github"] : [],
        operations: ["add", "replace", "remove", "test"],
        redaction: "none",
        issues: safeIssues(document),
        guidance:
          "Get authored values and revision before patching. Use create only for absent settings. Repair malformed JSON with a revision and valid replacement. Validation does not establish readiness or approval.",
      }
    },
    async get(input: z.infer<typeof settingsGet>) {
      settingsGet.parse(input)
      const { document } = await context(input)
      const value = authored(document)
      return {
        scope: input.scope,
        file: document.file,
        revision: document.revision,
        exists: document.source !== null,
        redaction: "none",
        issues: safeIssues(document),
        value: value === undefined ? null : selected(value, input.pointer ?? ""),
        ...(input.pointer !== undefined ? { pointer: input.pointer } : {}),
      }
    },
    async patch(input: z.infer<typeof settingsPatch>) {
      settingsPatch.parse(input)
      const { document } = await context(input)
      revision(
        document,
        input.create ? null : (input.revision ?? problem("invalid_input", "Revision is required")),
      )
      const original = authored(document)
      if (original === undefined) {
        problem("invalid_input", "Malformed JSON requires settings repair")
      }
      for (const op of input.patch) {
        const parts = tokens(op.path)
        if (
          input.scope === "instance" &&
          op.op !== "test" &&
          (!parts.length || ["approval", "github"].includes(parts[0]))
        ) {
          problem("invalid_input", "Approval and Git settings are not agent-writable")
        }
      }
      let value: unknown
      try {
        value = jsonpatch.applyPatch(
          document.source === null ? {} : original,
          structuredClone(input.patch),
          true,
          false,
          true,
        ).newDocument
      } catch {
        problem("invalid_input", "JSON Patch failed; no settings were saved")
      }
      return save(input, document, value)
    },
    async repair(input: z.infer<typeof settingsRepair>) {
      settingsRepair.parse(input)
      const { document } = await context(input)
      revision(document, input.revision)
      if (authored(document) !== undefined) {
        problem("invalid_input", "Repair requires malformed JSON; use patch for semantic edits")
      }
      if (
        input.scope === "instance" &&
        (input.value.approval !== "ask" || Object.hasOwn(input.value, "github"))
      ) {
        problem("invalid_input", "Instance repair requires approval ask and excludes Git settings")
      }
      return save(input, document, input.value, true)
    },
    async validate(input: Target) {
      const { document, service } = await context(settingsTarget.parse(input))
      if (service) {
        const result = await service.read()
        return {
          scope: input.scope,
          file: document.file,
          revision: document.revision,
          valid: result.valid,
          issues: result.issues.map(({ code, path }) => ({ code, path })),
          ...(result.plan ? { plan: result.plan } : {}),
          readiness: "not_checked",
          approval: "not_checked",
        }
      }
      return {
        scope: input.scope,
        file: document.file,
        revision: document.revision,
        valid: document.source !== null && document.issues.length === 0,
        issues: safeIssues(document),
        readiness: "not_checked",
        approval: "not_checked",
      }
    },
  }
}
export type SettingsAgent = ReturnType<typeof createSettingsAgent>
