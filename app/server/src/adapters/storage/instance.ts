import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { instanceSchema, instanceSettingsSchema } from "../../core/instance-schema.js"
import type { Instance, InstanceSettings } from "../../core/types/instance.js"

function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

function parse(source: string, path: string, label: string): unknown {
  try {
    return JSON.parse(source)
  } catch {
    throw new Error(`Invalid ${label}: ${path}. Expected JSON.`)
  }
}

function publish(path: string, source: string) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = openSync(temporary, "wx", 0o600)
    try {
      writeFileSync(file, source)
      fsyncSync(file)
    } finally {
      closeSync(file)
    }
    linkSync(temporary, path)
  } finally {
    if (existsSync(temporary)) {
      unlinkSync(temporary)
    }
  }
}

// Startup calls this while holding the runtime store's writer lock.
export function loadInstance(directory: string): {
  instance: Instance
  settings: InstanceSettings
} {
  const settingsPath = join(directory, "settings.json")
  const settingsSource = read(settingsPath)
  const settings = instanceSettingsSchema.safeParse(
    settingsSource === undefined ? {} : parse(settingsSource, settingsPath, "instance settings"),
  )
  if (!settings.success) {
    throw new Error(
      `Invalid instance settings: ${settingsPath}. ${settings.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")}`,
    )
  }

  const instancePath = join(directory, "instance.json")
  const instanceSource = read(instancePath)
  const instance = instanceSchema.safeParse(
    instanceSource === undefined
      ? { version: 1, id: randomUUID(), createdAt: new Date().toISOString() }
      : parse(instanceSource, instancePath, "instance metadata"),
  )
  if (!instance.success) {
    throw new Error(`Invalid instance metadata: ${instancePath}`)
  }
  if (instanceSource === undefined) {
    publish(instancePath, `${JSON.stringify(instance.data, null, 2)}\n`)
  }
  if (settingsSource === undefined) {
    publish(settingsPath, `${JSON.stringify(settings.data, null, 2)}\n`)
  }
  return { instance: instance.data, settings: settings.data }
}
