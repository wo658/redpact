import type { ExecutionScope, ExecutionSelection } from "./execution-selection.js"
import type { Settings } from "./settings.js"
export type ExecutionScopeInput = {
  kind: "unit" | "integration" | "playwright"
  executionScope?: ExecutionScope
  target?: string
  tests?: string[]
}
export type ExecutionScopeService = {
  resolve(worktreeId: string, input: ExecutionScopeInput): Promise<ExecutionSelection>
}
export type ExecutionScopeFiles = {
  catalog(
    root: string,
    settings: Settings,
    input: ExecutionScopeInput,
  ): Promise<{
    files: string[]
    testPatterns: string[]
    directories: string[]
    configurationDirectories: string[]
  }>
  changes(
    root: string,
    mainBranch: string | null,
  ): Promise<{ baseRevision: string; paths: string[] }>
}
