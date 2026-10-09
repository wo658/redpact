import { z } from "zod"

const viewSchema = z.object({
  page: z.enum([
    "current",
    "history",
    "execution-review",
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
  execution: z
    .object({ kind: z.enum(["unit", "integration", "playwright"]), id: z.string().min(1) })
    .optional(),
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

export function readWorkspaceLocation(search: string) {
  const query = new URLSearchParams(search)
  const projectId = query.get("project")
  const worktreeId = query.get("worktree") ?? undefined
  const kind = query.get("kind")
  const id = query.get("id")
  const page = query.get("page") ?? "current"
  const execution = kind || id ? { kind, id } : undefined
  const result = viewSchema.safeParse({
    page: page === "review" && execution ? "execution-review" : page,
    selectedId: worktreeId ?? "",
    ...(execution ? { execution } : {}),
  })
  if (!result.success || (result.data.page === "execution-review" && !result.data.execution)) {
    return undefined
  }
  if (!projectId && result.data.page !== "execution-review") {
    return undefined
  }
  return { projectId: projectId ?? undefined, worktreeId, view: result.data }
}

export function workspaceLocationUrl(tab: WorkspaceTab) {
  const view = tab.view ?? { page: "current", selectedId: tab.worktreeId ?? "" }
  const query = new URLSearchParams({
    project: tab.projectId,
    page: view.page === "execution-review" ? "review" : view.page,
  })
  if (view.selectedId) {
    query.set("worktree", view.selectedId)
  }
  if (view.execution) {
    query.set("kind", view.execution.kind)
    query.set("id", view.execution.id)
  }
  return `?${query}`
}

export function writeWorkspaceHistory(tab: WorkspaceTab, replace = false) {
  const current = readWorkspaceHistory(window.history.state)
  const currentView = current?.view ?? { page: "current", selectedId: current?.worktreeId ?? "" }
  const nextView = tab.view ?? { page: "current", selectedId: tab.worktreeId ?? "" }
  if (
    !replace &&
    current?.id === tab.id &&
    current.projectId === tab.projectId &&
    current.worktreeId === tab.worktreeId &&
    currentView.page === nextView.page &&
    currentView.selectedId === nextView.selectedId &&
    currentView.execution?.kind === nextView.execution?.kind &&
    currentView.execution?.id === nextView.execution?.id
  ) {
    return
  }
  const state = { ...window.history.state, redpactWorkspace: tab }
  if (replace) {
    window.history.replaceState(state, "", workspaceLocationUrl(tab))
  } else {
    window.history.pushState(state, "", workspaceLocationUrl(tab))
  }
}
