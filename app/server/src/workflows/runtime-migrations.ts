import { isDeepStrictEqual } from "node:util"
import { Umzug } from "umzug"
import { migrateManualEnvironmentScope } from "../core/manual-environment-migration.js"
import {
  migrateEnvironmentSettings,
  migrateFlatEnvironmentValues,
  validateCurrentEnvironmentRecord,
  validateMigrationHistory,
} from "../core/runtime-migrations.js"
import type {
  MigrationFile,
  RuntimeMigrationFiles,
  SelectionMigrationFile,
} from "../core/types/runtime-migrations.js"

// Append transformations; never change an applied migration's name or input contract.
const migrations = [
  { name: "001-fixed-environment-settings", transform: migrateEnvironmentSettings },
  { name: "002-flat-environment-values", transform: migrateFlatEnvironmentValues },
  { name: "003-execution-selection", transform: (source: string) => source },
  { name: "004-manual-environment-scope", transform: migrateManualEnvironmentScope },
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
    const planned = await Promise.all(
      records.map(async (file) => ({
        file,
        source: file.backup ?? file.source,
        intermediates: [file.backup ?? file.source],
        values: await files.environmentValues(file.id),
      })),
    )
    const selectionRecords = await files.executionSelections(firstPending)
    const selections = selectionRecords.map((file) => ({
      file,
      source: file.backup ?? file.source,
      intermediates: [file.backup ?? file.source],
    }))
    const completed = [...history]
    const migrator = new Umzug({
      logger: undefined,
      migrations: migrations.map(({ name, transform }) => ({
        name,
        async up() {
          for (const item of planned) {
            item.source = withRecordPath(item.file, () =>
              transform(item.source, item.file.id, item.values),
            )
            item.intermediates.push(item.source)
          }
          if (name === "003-execution-selection") {
            for (const item of selections) {
              item.source = withRecordPath(item.file, () =>
                addExecutionSelection(item.file, item.source),
              )
              item.intermediates.push(item.source)
            }
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
    for (const { file, source, intermediates } of planned) {
      withRecordPath(file, () => {
        validateCurrentEnvironmentRecord(source)
        if (
          file.backup !== undefined &&
          file.source !== file.backup &&
          !intermediates.some((value) =>
            isDeepStrictEqual(JSON.parse(file.source), JSON.parse(value)),
          )
        ) {
          throw new Error("Record differs from both its original backup and migrated output")
        }
      })
    }
    for (const { file, source, intermediates } of selections) {
      withRecordPath(file, () => {
        files.validateExecutionSelection(file, source)
        if (
          file.backup !== undefined &&
          !intermediates.some((value) =>
            isDeepStrictEqual(JSON.parse(file.source), JSON.parse(value)),
          )
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
    for (const { file, source } of selections) {
      if (source !== file.source) {
        await files.backupExecutionSelection(firstPending, file)
        await files.replaceExecutionSelection(file, source)
      }
    }
    await files.recordHistory(completed)
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
    throw new Error(
      `Runtime migration failed: ${cause}. No records are reset automatically. Originals remain in place or in .migrations/backups; correct the reported input and restart.`,
      { cause: error },
    )
  }
}

function addExecutionSelection(file: SelectionMigrationFile, source: string) {
  const value = JSON.parse(source)
  const data = file.family === "submissions" ? value.data : value
  if (data.executionSelection !== undefined) {
    return source
  }
  data.executionSelection = null
  return `${JSON.stringify(value, null, 2)}\n`
}

function withRecordPath<T>(file: MigrationFile & { family?: string }, action: () => T): T {
  try {
    return action()
  } catch (error) {
    throw new Error(
      `${file.family ?? "environments"}/${file.id}.json: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
