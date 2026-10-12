import type { MouseEvent } from "react"
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
    current.projectId === tab.projectId &&
    current.worktreeId === tab.worktreeId &&
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

export type ReviewLocation =
  | { page: "review"; kind: "unit" | "integration" | "playwright"; id: string }
  | { page: "history"; worktreeId: string }
  | { page: "empty" }
  | { page: "invalid" }

export function readReviewLocation(search: string): ReviewLocation {
  const query = new URLSearchParams(search)
  const page = query.get("page")
  if (page === "review") {
    const kind = query.get("kind")
    const id = query.get("id")
    if (id && (kind === "unit" || kind === "integration" || kind === "playwright")) {
      return { page, kind, id }
    }
    return { page: "invalid" }
  }
  if (page === "history") {
    const worktreeId = query.get("worktree")
    return worktreeId ? { page, worktreeId } : { page: "invalid" }
  }
  return { page: "empty" }
}

// Keep the mounted MCP transport while retaining ordinary links and browser history.
export function navigateReviewLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }
  const href = event.currentTarget.getAttribute("href")
  if (!href?.startsWith("?")) {
    return
  }
  event.preventDefault()
  if (window.location.search !== href) {
    window.history.pushState(null, "", href)
    window.dispatchEvent(new window.PopStateEvent("popstate"))
  }
}
