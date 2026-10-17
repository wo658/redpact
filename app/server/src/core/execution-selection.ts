import { problem } from "./problems.js"
import type { ExecutionScope, ExecutionSelection } from "./types/execution-selection.js"
export function selectExecutionFiles(input: {
  requested: ExecutionScope
  baseRevision: string | null
  files: string[]
  changedPaths: string[]
  supportingPaths: string[]
  explicitFiles?: string[]
}): ExecutionSelection {
  const files = [...new Set(input.files)].sort()
  const identity = { requested: input.requested, baseRevision: input.baseRevision }
  if (input.explicitFiles) {
    if (input.requested === "changed") {
      problem("invalid_input", "Changed execution cannot combine with explicit tests")
    }
    if (input.explicitFiles.some((file) => !files.includes(file))) {
      problem("invalid_input", "Explicit tests must belong to the current test catalog")
    }
    return {
      ...identity,
      resolved: "explicit",
      files: [...new Set(input.explicitFiles)].sort(),
      reason: "explicit_files",
    }
  }
  if (input.requested === "all") {
    return { ...identity, resolved: "all", files, reason: "all_requested" }
  }
  if (!input.baseRevision) {
    problem("invalid_input", "Changed execution requires a Git comparison base")
  }
  const changed = new Set(input.changedPaths)
  if (input.supportingPaths.some((path) => changed.has(path))) {
    return { ...identity, resolved: "all", files, reason: "supporting_inputs" }
  }
  const selected = files.filter((path) => changed.has(path))
  return {
    ...identity,
    resolved: "changed",
    files: selected,
    reason: selected.length ? "changed_files" : "no_changed_tests",
  }
}

export function summarizeExecutionSelection(selection?: ExecutionSelection | null) {
  if (!selection) {
    return null
  }
  return {
    ...selection,
    files: selection.files.slice(0, 50),
    fileCount: selection.files.length,
    truncated: selection.files.length > 50,
  }
}
