import { randomUUID } from "node:crypto"
import { link, lstat, mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import { executionReviewRecordSchema } from "../../core/execution-review-schema.js"
import { captureRunSchema } from "../../core/playwright-schema.js"
import type { RuntimeMigrationFiles } from "../../core/types/runtime-migrations.js"
import { unitRunSchema } from "../../core/unit-test-schema.js"
import { submissionSchema } from "./files.js"

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
    async executionSelections(migration) {
      const files = []
      for (const family of [
        "submissions",
        "unit-runs",
        "playwright-runs",
        "execution-reviews",
      ] as const) {
        const directory = join(root, family)
        let entries: string[]
        try {
          entries = await readdir(directory)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            continue
          }
          throw error
        }
        for (const name of entries.sort().filter((name) => name.endsWith(".json"))) {
          const id = name.slice(0, -5)
          const source = await readOptional(join(directory, name))
          if (source === undefined) {
            throw new Error(`Record disappeared during migration: ${family}/${name}`)
          }
          files.push({
            family,
            id,
            source,
            backup: await readOptional(
              join(root, ".migrations", "backups", migration, family, name),
            ),
          })
        }
      }
      return files
    },
    validateExecutionSelection(file, source) {
      const value = JSON.parse(source)
      let record: { id: string }
      if (file.family === "submissions") {
        record = z.strictObject({ version: z.literal(1), data: submissionSchema }).parse(value).data
      } else if (file.family === "unit-runs") {
        record = unitRunSchema.parse(value)
      } else if (file.family === "playwright-runs") {
        record = captureRunSchema.parse(value)
      } else {
        record = executionReviewRecordSchema.parse(value)
      }
      if (record.id !== file.id) {
        throw new Error(`Execution migration identity mismatch: ${file.family}/${file.id}`)
      }
    },
    async backupExecutionSelection(migration, file) {
      if (file.backup !== undefined) {
        return
      }
      const path = join(root, ".migrations", "backups", migration, file.family, `${file.id}.json`)
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const temporary = `${path}.${randomUUID()}.tmp`
      await atomicWrite(temporary, file.source)
      try {
        await link(temporary, path)
      } finally {
        await unlink(temporary)
      }
    },
    async replaceExecutionSelection(file, source) {
      const path = join(root, file.family, `${file.id}.json`)
      if ((await readOptional(path)) !== file.source) {
        throw new Error(`Execution record changed during migration: ${file.family}/${file.id}`)
      }
      await atomicWrite(path, source)
    },
    async environmentValues(id) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new Error("Invalid environment migration identity")
      }
      const source = await readOptional(join(root, "private-secrets", `environment-${id}.json`))
      if (source === undefined) {
        return {}
      }
      return z
        .strictObject({ version: z.literal(1), data: z.record(z.string(), z.string().max(10000)) })
        .parse(JSON.parse(source)).data
    },
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
