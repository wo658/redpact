import { randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, unlink } from "node:fs/promises"
import { join } from "node:path"
import { settingsSchema } from "../../core/settings-schema.js"

export async function initializeSettings(root: string): Promise<void> {
  const folder = join(root, ".redpact")
  await mkdir(folder, { recursive: true })
  if ((await lstat(folder)).isSymbolicLink()) {
    throw new Error("Settings directory must not be a symbolic link")
  }
  const target = join(folder, "settings.json")
  try {
    await lstat(target)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
  const temporary = join(folder, `.settings-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, "wx", 0o600)
    try {
      await file.writeFile(`${JSON.stringify(settingsSchema.parse({}), null, 2)}\n`)
      await file.sync()
    } finally {
      await file.close()
    }
    // Publish complete defaults without replacing a concurrent author's file.
    await link(temporary, target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error
      }
    })
  } finally {
    await unlink(temporary)
  }
}
