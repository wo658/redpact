import { randomUUID } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { ProjectSecretStore } from "../../core/types/project-secrets.js"

const recordSchema = z.strictObject({
  version: z.literal(1),
  data: z.record(z.string(), z.string().max(10000)),
})

// The instance writer lock also owns these private credentials, outside public evidence.
export function createProjectSecretStore(directory: string): ProjectSecretStore {
  const root = join(directory, "private-secrets")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Secret storage cannot be a symlink")
  }
  function path(kind: string, id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new Error("Invalid secret storage identity")
    }
    return join(root, `${kind}-${id}.json`)
  }
  function read(kind: string, id: string) {
    const file = path(kind, id)
    if (!existsSync(file)) {
      return undefined
    }
    if (lstatSync(file).isSymbolicLink() || lstatSync(file).size > 4 * 1024 * 1024) {
      throw new Error("Invalid secret storage file")
    }
    const result = recordSchema.safeParse(JSON.parse(readFileSync(file, "utf8")))
    if (!result.success) {
      throw new Error("Invalid secret storage record")
    }
    return result.data.data
  }
  function write(kind: string, id: string, values: Record<string, string>) {
    const file = path(kind, id)
    const temporary = `${file}.${randomUUID()}.tmp`
    const value = recordSchema.safeParse({ version: 1, data: values })
    if (!value.success || JSON.stringify(value.data).length > 4 * 1024 * 1024) {
      throw new Error("Invalid secret storage values")
    }
    try {
      writeFileSync(temporary, JSON.stringify(value.data), { flag: "wx", mode: 0o600, flush: true })
      renameSync(temporary, file)
    } finally {
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
  return {
    project: (id) => read("project", id) ?? {},
    saveProject: (id, values) => write("project", id, values),
    environment: (id) => read("environment", id),
    saveEnvironment: (id, values) => write("environment", id, values),
  }
}
