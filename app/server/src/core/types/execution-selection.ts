export type ExecutionScope = "all" | "changed"
export type ExecutionSelection = {
  requested: ExecutionScope
  resolved: ExecutionScope | "explicit"
  baseRevision: string | null
  files: string[]
  filesExact?: boolean
  reason:
    | "all_requested"
    | "changed_files"
    | "supporting_inputs"
    | "no_changed_tests"
    | "explicit_files"
}

export type UnitFileCommand = { executable: string; args: string[] }
