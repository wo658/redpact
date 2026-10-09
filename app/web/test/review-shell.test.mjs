import assert from "node:assert/strict"
import { after, afterEach, test } from "node:test"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
})
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "NodeFilter",
  "getComputedStyle",
  "localStorage",
  "customElements",
  "requestAnimationFrame",
  "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
}
// JSDOM has no scrolling implementation; preserve the element scroll state used by the renderer.
HTMLElement.prototype.scrollTo = function (options) {
  this.scrollTop = options.top ?? this.scrollTop
  this.scrollLeft = options.left ?? this.scrollLeft
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
const { createElement } = await import("react")
const { render, cleanup, screen, fireEvent, act, waitFor } = await import("@testing-library/react")
const { createServer } = await import("vite")
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
await i18n.changeLanguage("en")
afterEach(cleanup)
after(async () => {
  await server.close()
  dom.window.close()
})
const { WorktreePanel } = await server.ssrLoadModule("/src/components/project-manager.tsx")
const { SidebarProvider } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
const { TooltipProvider } = await server.ssrLoadModule("/src/components/ui/tooltip.tsx")
const { createApi } = await server.ssrLoadModule("/src/lib/api.ts")
test("채팅 검토 셸은 기본 화면과 보조 Tools에서 Git 작업 UI를 제공하지 않는다", async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json([])
  })
  render(
    createElement(
      TooltipProvider,
      null,
      createElement(
        SidebarProvider,
        { defaultOpen: true },
        createElement(WorktreePanel, {
          api,
          project: { id: "p", name: "Project", location: { kind: "git" } },
          projectMenu: "Project",
        }),
      ),
    ),
  )
  assert.ok(screen.getByRole("heading", { name: "Current work" }))
  assert.equal(screen.queryByRole("button", { name: "Git Graph" }), null)
  const tools = screen.getByRole("button", { name: "Tools" })
  assert.equal(tools.getAttribute("aria-expanded"), "false")
  fireEvent.click(tools)
  assert.equal(tools.getAttribute("aria-expanded"), "true")
  for (const label of ["Git Graph", "File Viewer", "Create worktree", "Attach worktree"]) {
    assert.equal(screen.queryByRole("button", { name: label }), null)
  }
  assert.equal(document.querySelector("web-git-graph"), null)
  assert.equal(
    calls.some(({ url }) => url.includes("/git/graph")),
    false,
  )
  assert.ok(calls.every(({ init }) => init.method === "GET"))
})

function captureEvents() {
  const events = []
  window.EventSource = class {
    constructor(url) {
      this.url = url
      this.closed = false
      events.push(this)
    }
    addEventListener() {}
    close() {
      this.closed = true
    }
  }
  return events
}

const pendingPreview = {
  settingsDigest: "settings-digest",
  inputDigest: "input-digest",
  command: "echo review",
  dockerfile: "Dockerfile",
  cwd: ".",
}

test("현재 작업은 실행 근거 알림으로 채팅 요청과 취소를 반영한다", async () => {
  const events = captureEvents()
  const { CurrentWork } = await server.ssrLoadModule("/src/components/execution-workspace.tsx")
  let pending = []
  const api = {
    workspaceStatus: async () => ({
      settings: { valid: true, issues: [] },
      approval: { policy: "ask", pending, pendingCount: pending.length },
      executions: { active: [], cleanup: [], recent: [] },
    }),
  }
  try {
    render(
      createElement(CurrentWork, {
        api,
        worktree: { id: "w-live", projectRoot: "/worktree" },
        loading: false,
        onReview() {},
      }),
    )
    await screen.findByText("No requests awaiting approval.")
    const subscription = events.find(
      (event) => new URL(event.url, "http://localhost").searchParams.get("scope") === "evidence",
    )
    assert.ok(subscription, "현재 작업은 실행과 검토 기록의 범위에 구독해야 한다")
    assert.equal(
      new URL(subscription.url, "http://localhost").searchParams.get("worktreeId"),
      "w-live",
    )
    pending = [{ id: "pending-live", kind: "unit", state: "awaiting_approval" }]
    await act(async () => subscription.onmessage())
    await screen.findByRole("button", { name: "Review request" }, { timeout: 2500 })
    pending = []
    await act(async () => subscription.onmessage())
    await screen.findByText("No requests awaiting approval.", {}, { timeout: 2500 })
  } finally {
    cleanup()
    delete window.EventSource
  }
})

test("실행 상세는 기록된 checkout의 근거 알림으로 외부 취소를 반영한다", async () => {
  const events = captureEvents()
  const { ExecutionReview } = await server.ssrLoadModule("/src/components/execution-workspace.tsx")
  let state = "awaiting_approval"
  const api = {
    reviewContext: async () => ({
      id: "request-live",
      kind: "unit",
      intent: "Live request",
      worktreeId: "recorded-worktree",
      path: "/recorded",
      state,
      executionId: null,
      outcome: null,
      cleanup: { state: "not_started", issues: [] },
      failures: [],
      failureCount: 0,
      reviewPath: "/?page=review&kind=unit&id=request-live",
      approval: { state, revision: 0, preview: pendingPreview },
    }),
  }
  try {
    render(
      createElement(ExecutionReview, {
        api,
        execution: { kind: "unit", id: "request-live" },
        onHistory() {},
      }),
    )
    await screen.findByRole("button", { name: "Approve execution" })
    const subscription = events.find(
      (event) =>
        !event.closed &&
        new URL(event.url, "http://localhost").searchParams.get("scope") === "evidence",
    )
    assert.ok(subscription, "요청을 읽은 후 해당 근거 범위를 구독해야 한다")
    assert.equal(
      new URL(subscription.url, "http://localhost").searchParams.get("worktreeId"),
      "recorded-worktree",
    )
    state = "cancelled"
    await act(async () => subscription.onmessage())
    await screen.findByText("cancelled", {}, { timeout: 2500 })
    assert.equal(screen.queryByRole("button", { name: "Approve execution" }), null)
    cleanup()
    assert.equal(subscription.closed, true)
  } finally {
    cleanup()
    delete window.EventSource
  }
})

test("checkout이 없는 과거 실행은 잘못된 범위 구독 없이 근거를 읽는다", async () => {
  const events = captureEvents()
  const { ExecutionReview } = await server.ssrLoadModule("/src/components/execution-workspace.tsx")
  const api = {
    reviewContext: async () => ({
      id: "historical",
      kind: "unit",
      intent: "Historical execution",
      worktreeId: null,
      path: null,
      state: "finished",
      executionId: "historical",
      outcome: "passed",
      cleanup: { state: "removed", issues: [] },
      failures: [],
      failureCount: 0,
      reviewPath: "/?page=review&kind=unit&id=historical",
      approval: null,
    }),
    unitRun: async () => ({ stdout: "historical output", stderr: "" }),
  }
  try {
    render(
      createElement(ExecutionReview, {
        api,
        execution: { kind: "unit", id: "historical" },
        onHistory() {},
      }),
    )
    await screen.findByText("historical output")
    await waitFor(() => assert.equal(events.length, 0))
  } finally {
    cleanup()
    delete window.EventSource
  }
})
