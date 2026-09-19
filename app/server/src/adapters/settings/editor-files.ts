import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { SettingsFiles } from "../../core/types/settings-editor.js"
import { readProjectFile } from "./bundle.js"

export function createSettingsFiles(): SettingsFiles {
  const writes = new Map<string, Promise<void>>()
  const read: SettingsFiles["read"] = async (root, path) => {
    try {
      const source = await readProjectFile(root, path)
      return { source, revision: createHash("sha256").update(source).digest("hex") }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { source: null, revision: null }
      }
      throw error
    }
  }
  return {
    read,
    async write(root, path, input) {
      const target = join(root, path)
      const operation = (writes.get(target) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const folder = dirname(target)
          await mkdir(folder, { recursive: true })
          if ((await lstat(folder)).isSymbolicLink()) {
            throw new Error("Settings directory must not be a symbolic link")
          }
          const temporary = `${target}.${randomUUID()}.tmp`
          try {
            const file = await open(temporary, "wx", 0o600)
            try {
              await file.writeFile(input.source)
              await file.sync()
            } finally {
              await file.close()
            }
            if ((await read(root, path)).revision !== input.revision) {
              throw Object.assign(
                new Error("Settings changed since loading. Reload before saving."),
                { code: "environment_conflict" },
              )
            }
            await rename(temporary, target)
          } finally {
            await unlink(temporary).catch((error) => {
              if (error.code !== "ENOENT") {
                throw error
              }
            })
          }
        })
      writes.set(target, operation)
      try {
        await operation
      } finally {
        if (writes.get(target) === operation) {
          writes.delete(target)
        }
      }
    },
  }
}
