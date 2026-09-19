import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { isNode, LineCounter, parseDocument } from "yaml"
import { projectPath } from "../../core/settings-schema.js"
import type { SettingsIssue } from "../../core/types/settings.js"
import type { ComposeModel } from "../environment/compose-model.js"
import { checkCompose } from "../environment/inputs.js"

export async function readProjectFile(root: string, path: string) {
  projectPath.parse(path)
  let current = await realpath(root)
  for (const part of path.split("/")) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) {
      throw Object.assign(new Error("Symbolic links are not allowed"), { code: "path" })
    }
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!(await handle.stat()).isFile()) {
      throw new Error("Expected regular file")
    }
    const bytes = Buffer.alloc(256 * 1024 + 1)
    let size = 0
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null)
      if (!result.bytesRead) {
        break
      }
      size += result.bytesRead
    }
    if (size > 256 * 1024) {
      throw Object.assign(new Error("Settings file exceeds 256 KiB"), { code: "size" })
    }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, size),
    )
  } finally {
    await handle.close()
  }
}
function document(source: string, file: string) {
  const lines = new LineCounter()
  const doc = parseDocument(source, {
    version: "1.2",
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    lineCounter: lines,
  })
  if (doc.errors.length || doc.warnings.length || doc.directives?.yaml.version !== "1.2") {
    throw Object.assign(new Error(`Invalid YAML 1.2: ${file}`), { code: "yaml" })
  }
  const value: unknown = doc.toJS({ maxAliasCount: 100 })
  function locate(path: string): SettingsIssue {
    const parts = path ? path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : []
    let node: unknown = doc.contents
    while (parts.length) {
      node = doc.getIn(parts, true)
      if (isNode(node)) {
        break
      }
      parts.pop()
    }
    const pos = lines.linePos(isNode(node) ? (node.range?.[0] ?? 0) : 0)
    return { file, path, line: pos.line, column: pos.col, code: "schema", message: "Invalid value" }
  }
  return { value, locate }
}
export async function readComposeModel(root: string, files: string[]) {
  const model: ComposeModel = { services: {}, networks: {}, volumes: {} }
  const sources: { file: string; source: string; model: ComposeModel }[] = []
  for (const file of files) {
    const source = await readProjectFile(root, file)
    const value = document(source, file).value as ComposeModel
    checkCompose(value)
    for (const [id, service] of Object.entries(value.services)) {
      if (Array.isArray(service.depends_on)) {
        service.depends_on = Object.fromEntries(
          service.depends_on.map((name: string) => [name, { condition: "service_started" }]),
        )
      }
      service.depends_on ??= {}
      for (const [dependency, edge] of Object.entries(service.depends_on)) {
        if (!edge || typeof edge !== "object" || ("required" in edge && edge.required === false)) {
          throw new Error("Optional Compose prerequisites are unsupported")
        }
        const condition = edge.condition ?? "service_started"
        if (
          !["service_started", "service_healthy", "service_completed_successfully"].includes(
            condition,
          )
        ) {
          throw new Error("Unsupported prerequisite condition")
        }
        service.depends_on[dependency] = { condition }
      }
      if (/(?<![$])\$[A-Za-z_]/.test(JSON.stringify(service))) {
        throw new Error("Selected Compose interpolation requires explicit braced variables")
      }
      if (service.profiles) {
        throw new Error("Selected Compose environments do not support profiles")
      }
      for (const field of ["ports", "networks", "depends_on"] as const) {
        const previous = model.services[id]?.[field]
        if (
          previous !== undefined &&
          service[field] !== undefined &&
          !isDeepStrictEqual(previous, service[field])
        ) {
          throw new Error(`Unsupported structural override: ${id}.${field}`)
        }
        if (JSON.stringify(service[field])?.includes("${")) {
          throw new Error("Compose relationship fields cannot interpolate")
        }
      }
      const normalizeEnv = (env: typeof service.environment) =>
        Array.isArray(env)
          ? Object.fromEntries(
              env.map((v) => {
                const index = v.indexOf("=")
                return [v.slice(0, index), v.slice(index + 1)]
              }),
            )
          : (env ?? {})
      service.environment = normalizeEnv(service.environment)
      const environment = {
        ...normalizeEnv(model.services[id]?.environment),
        ...normalizeEnv(service.environment),
      }
      model.services[id] = { ...model.services[id], ...service, environment }
    }
    Object.assign(model.networks ?? {}, value.networks)
    Object.assign(model.volumes ?? {}, value.volumes)
    sources.push({ file, source, model: value })
  }
  return { model, sources }
}
