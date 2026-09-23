import type { z } from "zod"
import type { unitRunSchema, unitTestSettingsSchema } from "../unit-test-schema.js"
export type UnitTestSettings = z.infer<typeof unitTestSettingsSchema>
export type UnitRun = z.infer<typeof unitRunSchema>
export type UnitCatalog = {
  baseRevision?: string
  files: { path: string; source: string | null; issue?: string }[]
  diagnostics: string[]
}
export type UnitTestFiles = {
  catalog(
    root: string,
    base: string | null,
    patterns: string[],
    directory?: string,
    scope?: "changed" | "all",
  ): Promise<UnitCatalog>
  directory(root: string, cwd: string): Promise<string>
}
export type UnitCommandResult = Pick<
  UnitRun,
  "outcome" | "exitCode" | "stdout" | "stderr" | "truncated" | "error" | "resourceLimit"
>
export type UnitCommand = {
  execute(
    run: UnitRun,
    signal: AbortSignal,
    observe: (
      change: Partial<Pick<UnitRun, "runtimeId" | "containerId" | "imageId" | "inputDigest">>,
    ) => void,
  ): Promise<UnitCommandResult>
  stop(run: UnitRun): Promise<void>
}
export type UnitRunStore = { list(): UnitRun[]; save(run: UnitRun): void }
export type UnitTestsService = {
  busy(ids?: string[]): boolean
  inspect(
    worktreeId: string,
    scope?: "changed" | "all",
  ): Promise<{ settings: UnitTestSettings | null; catalog: UnitCatalog; runs: UnitRun[] }>
  start(worktreeId: string): Promise<UnitRun>
  get(id: string): UnitRun
  cancel(id: string): Promise<UnitRun>
  close(): Promise<void>
}
