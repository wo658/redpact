import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { dirname, join } from "node:path"
import { execa } from "execa"
import { parseDocument } from "yaml"
import { projectPath } from "../../core/settings-schema.js"
import type { ComposeModel } from "../environment/compose-model.js"
import { minimalEnvironment } from "../process/environment.js"

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
  const doc = parseDocument(source)
  if (doc.errors.length) {
    throw Object.assign(new Error(`Invalid Compose YAML: ${file}`), { code: "yaml" })
  }
  return doc.toJS({ maxAliasCount: 100 }) as ComposeModel
}

export async function readComposeModel(root: string, files: string[]) {
  const model: ComposeModel = { services: {}, networks: {}, volumes: {} }
  const sources: { file: string; source: string; model: ComposeModel }[] = []
  for (const file of files) {
    const source = await readProjectFile(root, file)
    const value = document(source, file)
    for (const [id, service] of Object.entries(value.services ?? {})) {
      if (Array.isArray(service.depends_on)) {
        service.depends_on = Object.fromEntries(
          service.depends_on.map((name: string) => [name, { condition: "service_started" }]),
        )
      }
      service.depends_on ??= {}
      const normalizeEnv = (env: typeof service.environment) =>
        Array.isArray(env)
          ? Object.fromEntries(
              env.map((v) => {
                const index = v.indexOf("=")
                return index < 0 ? [v, null] : [v.slice(0, index), v.slice(index + 1)]
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
  if (
    sources.some(
      ({ model: source }) =>
        source.include || Object.values(source.services ?? {}).some((service) => service.extends),
    )
  ) {
    // Let Compose discover imported services rather than implementing include/extends ourselves.
    const resolved = await execa(
      "docker",
      [
        "compose",
        "--project-directory",
        dirname(join(root, files[0])),
        "--profile",
        "*",
        ...files.flatMap((file) => ["-f", join(root, file)]),
        "config",
        "--no-interpolate",
        "--no-env-resolution",
        "--format",
        "json",
      ],
      {
        cwd: root,
        env: minimalEnvironment(),
        extendEnv: false,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    return { model: JSON.parse(resolved.stdout) as ComposeModel, sources }
  }
  return { model, sources }
}
