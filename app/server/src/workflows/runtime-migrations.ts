import { isDeepStrictEqual } from "node:util"
import { Umzug } from "umzug"
import {
  migrateEnvironmentSettings,
  validateCurrentEnvironmentRecord,
  validateMigrationHistory,
} from "../core/runtime-migrations.js"
import type { MigrationFile, RuntimeMigrationFiles } from "../core/types/runtime-migrations.js"

// Append transformations; never change an applied migration's name or input contract.
const migrations = [
  { name: "001-fixed-environment-settings", transform: migrateEnvironmentSettings },
]
const names = migrations.map(({ name }) => name)

export async function migrateRuntime(files: RuntimeMigrationFiles) {
  const history = validateMigrationHistory(await files.history(), names)
  const firstPending = names[history.length]
  if (firstPending === undefined) {
    return
  }
  try {
    const records = await files.environments(firstPending)
    const planned = records.map((file) => ({ file, source: file.backup ?? file.source }))
    const completed = [...history]
    const migrator = new Umzug({
      logger: undefined,
      migrations: migrations.map(({ name, transform }) => ({
        name,
        async up() {
          for (const item of planned) {
            item.source = withRecordPath(item.file, () => transform(item.source, item.file.id))
          }
        },
      })),
      storage: {
        executed: async () => [...completed],
        async logMigration({ name }) {
          completed.push(name)
        },
        async unlogMigration() {
          throw new Error(
            "Runtime downgrades are unsupported; restore a complete backup with its matching app",
          )
        },
      },
    })
    // Umzug orders transformations in memory. Publish history only after all durable replacements.
    await migrator.up()
    validateMigrationHistory(completed, names)
    for (const { file, source } of planned) {
      withRecordPath(file, () => {
        validateCurrentEnvironmentRecord(source)
        if (
          file.backup !== undefined &&
          file.source !== file.backup &&
          !isDeepStrictEqual(JSON.parse(file.source), JSON.parse(source))
        ) {
          throw new Error("Record differs from both its original backup and migrated output")
        }
      })
    }
    for (const { file, source } of planned) {
      if (source !== file.source) {
        await files.backupEnvironment(firstPending, file)
        await files.replaceEnvironment(file, source)
      }
    }
    await files.recordHistory(completed)
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
    throw new Error(
      `Runtime migration failed: ${cause}. Originals are retained in .migrations/backups; correct the reported input and restart.`,
      { cause: error },
    )
  }
}

function withRecordPath<T>(file: MigrationFile, action: () => T): T {
  try {
    return action()
  } catch (error) {
    throw new Error(
      `environments/${file.id}.json: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
