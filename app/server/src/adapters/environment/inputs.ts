import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { parseDocument } from "yaml"
import type { ComposeSettings } from "../../core/types/settings.js"
import type { ComposeModel } from "./compose-model.js"

export function contained(root: string, path: string) {
  const rel = relative(root, path)
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error("Input escapes project root")
  }
  return path
}
export async function projectFile(root: string, path: string) {
  if (isAbsolute(path)) {
    throw new Error("Use project-relative inputs")
  }
  return contained(await realpath(root), await realpath(resolve(root, path)))
}
const forbiddenService = [
  "container_name",
  "network_mode",
  "pid",
  "ipc",
  "privileged",
  "devices",
  "cap_add",
  "volumes_from",
  "extends",
  "env_file",
  "secrets",
  "configs",
  "provider",
  "develop",
  "post_start",
  "pre_stop",
  "pre_start",
  "use_api_socket",
  "external_links",
  "links",
]
export function checkCompose(model: ComposeModel, effective = false) {
  if (model.include) {
    throw new Error("Compose include is not supported; list files explicitly")
  }
  if (model.secrets || model.configs) {
    throw new Error("Compose file secrets/configs are not supported; use explicit input references")
  }
  if (!model.services || typeof model.services !== "object") {
    throw new Error("Compose services are required")
  }
  for (const kind of ["volumes", "networks"] as const) {
    for (const [name, resource] of Object.entries(model[kind] ?? {})) {
      if (
        resource?.external ||
        (!effective && resource?.name) ||
        resource?.driver_opts ||
        (resource?.driver && !["local", "bridge"].includes(resource.driver))
      ) {
        throw new Error(`Shared or custom ${kind}.${name} is not supported`)
      }
    }
  }
  for (const [name, service] of Object.entries(model.services)) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || !service || typeof service !== "object") {
      throw new Error("Invalid Compose service")
    }
    for (const key of forbiddenService) {
      if (service[key] !== undefined) {
        throw new Error(`services.${name}.${key} is not supported`)
      }
    }
    if (
      service.deploy &&
      (Object.keys(service.deploy).some((key) => !["resources", "replicas"].includes(key)) ||
        (service.deploy.replicas !== undefined && service.deploy.replicas !== 1))
    ) {
      throw new Error("Only single local service instances are supported")
    }
    if (service.scale && service.scale !== 1) {
      throw new Error("Only one replica is supported")
    }
    for (const port of service.ports ?? []) {
      if (typeof port === "number") {
        continue
      }
      if (typeof port === "string") {
        if (!/^\d+(\/tcp)?$/.test(port)) {
          throw new Error("Fixed host ports and UDP are unsupported")
        }
      } else if (
        (port.published && String(port.published) !== "0") ||
        (port.protocol && port.protocol !== "tcp") ||
        (port.host_ip && port.host_ip !== "127.0.0.1")
      ) {
        throw new Error("Use dynamic loopback TCP ports")
      }
    }
    for (const volume of service.volumes ?? []) {
      if (typeof volume === "string") {
        const parts = volume.split(":")
        if (parts.length > 1 && !/^[a-zA-Z0-9_-]+$/.test(parts[0])) {
          throw new Error("Host bind mounts are unsupported")
        }
      } else if (!["volume", "tmpfs"].includes(volume.type)) {
        throw new Error("Host bind mounts are unsupported")
      }
    }
    if (service.build && typeof service.build !== "string") {
      for (const key of [
        "additional_contexts",
        "ssh",
        "secrets",
        "network",
        "entitlements",
        "privileged",
        "cache_to",
        "cache_from",
      ]) {
        if (service.build[key]) {
          throw new Error(`build.${key} is unsupported`)
        }
      }
    }
    if (!effective) {
      const entries = Array.isArray(service.environment)
        ? service.environment.map((v: string) => v.split(/=(.*)/s).slice(0, 2))
        : Object.entries(service.environment ?? {})
      for (const [, value] of entries) {
        if (value === null || value === undefined) {
          throw new Error("Implicit environment inheritance is unsupported")
        }
      }
    }
  }
}
export async function validateComposeInputs(root: string, settings: ComposeSettings) {
  for (const file of settings.environment.compose.files) {
    const source = await readFile(await projectFile(root, file), "utf8")
    if (Buffer.byteLength(source) > 256 * 1024) {
      throw new Error("Compose file exceeds 256 KiB")
    }
    const doc = parseDocument(source, { uniqueKeys: true, strict: true })
    if (doc.errors.length || doc.warnings.length) {
      throw new Error(`Invalid Compose YAML: ${file}`)
    }
    checkCompose(doc.toJS({ maxAliasCount: 100 }))
  }
}
const excluded = new Set([
  ".git",
  ".codex",
  "node_modules",
  ".pnpm-store",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".env",
])
export async function snapshotInputs(
  root: string,
  destination?: string,
  options: { rejectExcluded?: boolean } = {},
): Promise<string> {
  const hash = createHash("sha256")
  async function walk(directory: string) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (excluded.has(entry.name) || entry.name.startsWith(".env.")) {
        if (options.rejectExcluded) {
          throw new Error(
            `Cannot remove unrecorded input: ${relative(root, join(directory, entry.name))}`,
          )
        }
        continue
      }
      const path = join(directory, entry.name)
      const rel = relative(root, path)
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are unsupported in environment inputs: ${rel}`)
      }
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`Input is not a regular file: ${rel}`)
      }
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      let data: Buffer
      let mode: number
      try {
        const stat = await handle.stat()
        if (!stat.isFile()) {
          throw new Error(`Input changed type: ${rel}`)
        }
        mode = stat.mode & 0o777
        data = await handle.readFile()
        if (data.length !== stat.size) {
          throw new Error(`Input changed while being copied: ${rel}`)
        }
      } finally {
        await handle.close()
      }
      hash.update(JSON.stringify([rel, mode, data.length])).update(data)
      if (destination) {
        const target = join(destination, rel)
        await mkdir(dirname(target), { recursive: true, mode: 0o700 })
        await writeFile(target, data, { flag: "wx", mode })
      }
    }
  }
  await walk(root)
  return hash.digest("hex")
}
