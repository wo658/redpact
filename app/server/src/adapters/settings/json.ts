import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { isNode, LineCounter, parseDocument } from "yaml"
import { planContainers } from "../../core/container-plan.js"
import { settingsSchema } from "../../core/settings-schema.js"
import type {
  SettingsIssue,
  SettingsResult,
  SettingsService,
  TestSelection,
} from "../../core/types/settings.js"
import { discoverPlaywright } from "../playwright/catalog.js"
import { readComposeModel, readProjectFile } from "./bundle.js"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")
function document(source: string, file: string) {
  function syntax(message: string, offset: number): never {
    const prefix = source.slice(0, offset).split("\n")
    throw Object.assign(new Error(message), {
      code: "json",
      line: prefix.length,
      column: prefix[prefix.length - 1].length + 1,
    })
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const position = /position (\d+)/.exec(message)
    let offset = 0
    if (position) {
      offset = Number(position[1])
    } else if (message.includes("end")) {
      offset = source.length
    }
    syntax("Invalid JSON syntax", offset)
  }
  // Reuse the adopted source parser for duplicate keys and field locations after strict JSON parsing.
  const lines = new LineCounter()
  const parsed = parseDocument(source, {
    version: "1.2",
    uniqueKeys: true,
    stringKeys: true,
    lineCounter: lines,
  })
  const diagnostic = [...parsed.errors, ...parsed.warnings][0]
  if (diagnostic) {
    syntax(
      diagnostic.code === "DUPLICATE_KEY" ? "Duplicate JSON object key" : "Invalid JSON object",
      diagnostic.pos[0],
    )
  }
  function locate(path: string): SettingsIssue {
    const parts = path
      ? path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : []
    let node: unknown = parsed.contents
    while (parts.length) {
      node = parsed.getIn(parts, true)
      if (isNode(node)) {
        break
      }
      parts.pop()
    }
    const position = lines.linePos(isNode(node) ? (node.range?.[0] ?? 0) : 0)
    return {
      code: "schema",
      path,
      file,
      message: "Invalid value",
      line: position.line,
      column: position.col,
    }
  }
  return { value, locate }
}

export function parseSettings(source: string, file: string): SettingsResult {
  try {
    if (Buffer.byteLength(source) > 256 * 1024) {
      throw new Error("Settings must not exceed 256 KiB")
    }
    const doc = document(source, file),
      parsed = settingsSchema.safeParse(doc.value)
    if (!parsed.success) {
      return {
        valid: false,
        file,
        issues: parsed.error.issues.flatMap((issue) => {
          const paths =
            issue.code === "unrecognized_keys"
              ? issue.keys.map((key) => [...issue.path, key])
              : [issue.path]
          return paths.map((path) => ({ ...doc.locate(path.join(".")), message: issue.message }))
        }),
      }
    }
    return {
      valid: true,
      file,
      issues: [],
      settings: parsed.data,
      source,
      digest: hash(JSON.stringify([[".redpact/settings.json", hash(source)]])),
    }
  } catch (error) {
    return {
      valid: false,
      file,
      issues: [
        {
          code: "json",
          path: "",
          file,
          message: error instanceof Error ? error.message : "Invalid settings",
          ...(error instanceof Error && "line" in error && "column" in error
            ? { line: Number(error.line), column: Number(error.column) }
            : {}),
        },
      ],
    }
  }
}
export async function readJsonSettings(
  root: string,
  selection?: TestSelection,
  projectRules?: SettingsResult["projectRules"],
): Promise<SettingsResult> {
  const entry = ".redpact/settings.json",
    file = projectRules?.file ?? join(root, entry)
  let parsedSettings: SettingsResult["settings"]
  try {
    const source = projectRules?.source ?? (await readProjectFile(root, entry))
    const result = parseSettings(source, file)
    if (!result.valid || !result.settings) {
      return result
    }
    const effective = result.source ?? source
    parsedSettings = result.settings
    const files = [{ path: entry, source, sha256: hash(source) }]
    if (projectRules) {
      result.projectRules = projectRules
    }
    if (result.settings.unitTests) {
      await readProjectFile(root, result.settings.unitTests.dockerfile)
    }
    if (result.settings.playwright) {
      await discoverPlaywright(root, result.settings.playwright)
    }
    const { model } = await readComposeModel(root, result.settings.composeFiles)
    const planned = planContainers(result.settings, model, selection)
    if (planned.issues.length) {
      const doc = document(effective, file)
      return {
        valid: false,
        file,
        settings: parsedSettings,
        issues: planned.issues.map((i) => ({ ...doc.locate(i.path), ...i })),
      }
    }
    if (!projectRules && (await readProjectFile(root, entry)) !== source) {
      throw new Error("Settings changed while reading")
    }
    return {
      ...result,
      bundle: { files },
      plan: planned.plan,
      containers: Object.keys(model.services).sort(),
    }
  } catch (error) {
    return {
      valid: false,
      file,
      settings: parsedSettings,
      issues: [
        {
          code: (error as NodeJS.ErrnoException).code ?? "compose",
          path: "",
          file,
          message: error instanceof Error ? error.message : "Invalid settings",
        },
      ],
    }
  }
}
export function createSettingsService(projectPath: string, sharedRoot?: string): SettingsService {
  const projectRoot = resolve(projectPath)
  const rulesRoot = resolve(sharedRoot ?? projectPath)
  return {
    projectRoot,
    rulesRoot,
    async read(selection) {
      if (projectRoot === rulesRoot) {
        return readJsonSettings(projectRoot, selection)
      }
      const file = join(rulesRoot, ".redpact/settings.json")
      try {
        const source = await readProjectFile(rulesRoot, ".redpact/settings.json")
        const result = await readJsonSettings(projectRoot, selection, { file, source })
        if (source !== (await readProjectFile(rulesRoot, ".redpact/settings.json"))) {
          throw new Error("Project rules changed while reading")
        }
        return result
      } catch (error) {
        return {
          valid: false,
          file,
          issues: [
            {
              code: "project_rules",
              path: "",
              file: (error as { overrideFile?: string }).overrideFile ?? file,
              message: error instanceof Error ? error.message : "Project rules unavailable",
            },
          ],
        }
      }
    },
  }
}
