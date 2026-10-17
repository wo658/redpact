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
  async function preserveBackup(
    root: string,
    path: string,
    source: string,
    revision: string | null,
  ) {
    const backupPath = `${path}.repair-${revision}.bak`
    try {
      const backup = await open(join(root, backupPath), "wx", 0o600)
      try {
        await backup.writeFile(source)
        await backup.sync()
      } finally {
        await backup.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error
      }
      if ((await read(root, backupPath)).source !== source) {
        throw new Error("Existing settings repair backup does not match the original")
      }
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
            const original = await read(root, path)
            if (original.revision !== input.revision) {
              throw Object.assign(
                new Error("Settings changed since loading. Reload before saving."),
                { code: "environment_conflict" },
              )
            }
            if (input.backup && original.source !== null) {
              await preserveBackup(root, path, original.source, original.revision)
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
