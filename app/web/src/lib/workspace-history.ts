import { z } from "zod"

const viewSchema = z.object({
  page: z.enum([
    "test-container",
    "tests",
    "files",
    "git-graph",
    "review",
    "dependencies",
    "project-settings",
    "settings",
  ]),
  selectedId: z.string(),
})

const tabSchema = z.object({
  id: z.string(),
  kind: z.enum(["project", "worktree"]),
  label: z.string(),
  projectId: z.string(),
  worktreeId: z.string().optional(),
  view: viewSchema.optional(),
})

export type WorkspaceView = z.infer<typeof viewSchema>
export type WorkspacePage = WorkspaceView["page"]
export type WorkspaceTab = z.infer<typeof tabSchema>

export function readWorkspaceHistory(state: unknown): WorkspaceTab | undefined {
  const result = z.object({ redpactWorkspace: tabSchema }).safeParse(state)
  return result.success ? result.data.redpactWorkspace : undefined
}

export function writeWorkspaceHistory(tab: WorkspaceTab, replace = false) {
  const current = readWorkspaceHistory(window.history.state)
  const currentView = current?.view ?? { page: "review", selectedId: current?.worktreeId ?? "" }
  const nextView = tab.view ?? { page: "review", selectedId: tab.worktreeId ?? "" }
  if (
    !replace &&
    current?.id === tab.id &&
    currentView.page === nextView.page &&
    currentView.selectedId === nextView.selectedId
  ) {
    return
  }
  const state = { ...window.history.state, redpactWorkspace: tab }
  if (replace) {
    window.history.replaceState(state, "")
  } else {
    window.history.pushState(state, "")
  }
}
