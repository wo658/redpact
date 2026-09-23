export interface MigrationFile {
  id: string
  source: string
  backup?: string
}

export interface RuntimeMigrationFiles {
  history(): Promise<unknown>
  recordHistory(names: string[]): Promise<void>
  environments(migration: string): Promise<MigrationFile[]>
  backupEnvironment(migration: string, file: MigrationFile): Promise<void>
  replaceEnvironment(file: MigrationFile, source: string): Promise<void>
}
