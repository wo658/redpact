export interface MigrationFile {
  id: string
  source: string
  backup?: string
}

export interface RuntimeMigrationFiles {
  executionSelections(migration: string): Promise<SelectionMigrationFile[]>
  validateExecutionSelection(file: SelectionMigrationFile, source: string): void
  backupExecutionSelection(migration: string, file: SelectionMigrationFile): Promise<void>
  replaceExecutionSelection(file: SelectionMigrationFile, source: string): Promise<void>
  environmentValues(id: string): Promise<Record<string, string>>
  history(): Promise<unknown>
  recordHistory(names: string[]): Promise<void>
  environments(migration: string): Promise<MigrationFile[]>
  backupEnvironment(migration: string, file: MigrationFile): Promise<void>
  replaceEnvironment(file: MigrationFile, source: string): Promise<void>
}

export type SelectionMigrationFile = MigrationFile & {
  family: "submissions" | "unit-runs" | "playwright-runs" | "execution-reviews"
}
