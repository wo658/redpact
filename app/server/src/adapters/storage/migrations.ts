import { randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { RuntimeMigrationFiles } from "../../core/types/runtime-migrations.js"

async function readOptional(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path)
    if (!stat.isFile()) {
      throw new Error(`Expected a regular migration file: ${path}`)
    }
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

async function atomicWrite(path: string, source: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, "wx", 0o600)
  try {
    await file.writeFile(source)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error
      }
    })
  }
}

// The caller holds the instance store's writer lock for the whole migration sequence.
export function createRuntimeMigrationFiles(root: string): RuntimeMigrationFiles {
  const pathFor = (id: string) => join(root, "environments", `${id}.json`)
  const backupFor = (migration: string, id: string) =>
    join(root, ".migrations", "backups", migration, "environments", `${id}.json`)
  const journal = join(root, ".migrations", "completed.json")
  return {
    async history() {
      const source = await readOptional(journal)
      return source === undefined ? [] : JSON.parse(source)
    },
    recordHistory: (names) => atomicWrite(journal, `${JSON.stringify(names, null, 2)}\n`),
    async environments(migration) {
      const directory = join(root, "environments")
      let names: string[]
      try {
        names = await readdir(directory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return []
        }
        throw error
      }
      const files = []
      for (const name of names.sort()) {
        if (!name.endsWith(".json")) {
          continue
        }
        const id = name.slice(0, -5)
        const source = await readOptional(pathFor(id))
        if (source === undefined) {
          throw new Error(`Environment disappeared during migration: ${name}`)
        }
        files.push({ id, source, backup: await readOptional(backupFor(migration, id)) })
      }
      return files
    },
    async backupEnvironment(migration, file) {
      const destination = backupFor(migration, file.id)
      if (file.backup !== undefined) {
        return
      }
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      // Publish the complete durable backup without ever overwriting an earlier original.
      const temporary = `${destination}.${randomUUID()}.tmp`
      await atomicWrite(temporary, file.source)
      try {
        await link(temporary, destination)
        const backup = await open(destination, "r")
        try {
          await backup.sync()
        } finally {
          await backup.close()
        }
      } finally {
        await unlink(temporary)
      }
    },
    async replaceEnvironment(file, source) {
      if ((await readOptional(pathFor(file.id))) !== file.source) {
        throw new Error(`Environment changed during migration: ${file.id}`)
      }
      await atomicWrite(pathFor(file.id), source)
    },
  }
}
