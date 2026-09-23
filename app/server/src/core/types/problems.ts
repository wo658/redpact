export type Problem = {
  code:
    | "git_fetch_failed"
    | "graph_changed"
    | "directory_picker_busy"
    | "directory_picker_failed"
    | "directory_picker_unavailable"
    | "environment_conflict"
    | "environment_error"
    | "configuration_error"
    | "settings_unsupported"
    | "work_start_conflict"
    | "work_start_incomplete"
    | "not_found"
    | "invalid_input"
    | "closing"
    | "project_mismatch"
    | "project_disconnected"
    | "worktree_unavailable"
    | "worktree_busy"
    | "target_required"
  message: string
}
