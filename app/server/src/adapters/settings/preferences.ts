import { randomUUID } from "node:crypto"
import { link, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { parseDocument } from "yaml"
import type { z } from "zod"
import { testSelectionSchema } from "../../core/settings-schema.js"
import { trackingSchema } from "../../core/tracking-schema.js"
import type { PreferenceFiles } from "../../core/types/preferences.js"
import { readProjectFile } from "./bundle.js"

async function read<T>(root: string, file: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const source = await readProjectFile(root, `.redpact/${file}`)
    const value: unknown = JSON.parse(source)
    const parsed = parseDocument(source, { uniqueKeys: true })
    if (parsed.errors.length || parsed.warnings.length) {
      throw new Error("Invalid JSON or duplicate keys")
    }
    return schema.parse(value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw Object.assign(new Error(`Invalid .redpact/${file}: ${(error as Error).message}`), {
      code: "invalid_input",
    })
  }
}

async function write(root: string, file: string, value: unknown, initial = false) {
  const folder = join(root, ".redpact")
  await mkdir(folder, { recursive: true })
  if ((await lstat(folder)).isSymbolicLink()) {
    throw new Error("Preference directory must not be a symbolic link")
  }
  const target = join(folder, file)
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
    if (initial) {
      // Never overwrite a file authored concurrently with legacy preference recovery.
      await link(temp, target).catch((error) => {
        if (error.code !== "EEXIST") {
          throw error
        }
      })
    } else {
      await rename(temp, target)
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") {
        throw error
      }
    })
  }
}

async function recover<T>(root: string, file: string, schema: z.ZodType<T>, previous?: T) {
  const current = await read(root, file, schema)
  if (current !== null || previous === undefined) {
    return current
  }
  await write(root, file, schema.parse(previous), true)
  return read(root, file, schema)
}

async function save<T>(root: string, file: string, schema: z.ZodType<T>, value: T) {
  const parsed = schema.parse(value)
  if (!isDeepStrictEqual(await read(root, file, schema), parsed)) {
    await write(root, file, parsed)
  }
}

export const preferenceFiles: PreferenceFiles = {
  integrationDefaults: (root) => read(root, "integration-defaults.json", testSelectionSchema),
  saveIntegrationDefaults: (root, value) =>
    save(root, "integration-defaults.json", testSelectionSchema, value),
  tracking: (root, previous) => recover(root, "tracking.json", trackingSchema, previous),
  saveTracking: (root, value) => save(root, "tracking.json", trackingSchema, value),
  selection: (root, previous) => recover(root, "selection.json", testSelectionSchema, previous),
  saveSelection: (root, value) => save(root, "selection.json", testSelectionSchema, value),
}
