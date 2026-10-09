import type { MouseEvent } from "react"

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
