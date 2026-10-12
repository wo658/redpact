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
const { createApi } = await server.ssrLoadModule("/src/lib/api.ts")
test("앱 홈은 프로젝트 관리에 연결하고 채팅 검토를 강요하지 않는다", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  const { sampleApi } = await import("./workspace-fixture.mjs")
  captureEvents()
  render(createElement(App, { api: sampleApi() }))
  await waitFor(() => assert.ok(screen.getByRole("tablist", { name: "Open workspaces" })))
  fireEvent.click(screen.getByRole("button", { name: "Redpact example", exact: true }))
  assert.ok(await screen.findByRole("menuitem", { name: "Manage projects" }))
  assert.equal(screen.queryByRole("heading", { name: "Open an execution from chat" }), null)
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

test("이력은 URL의 checkout만 읽고 실행 링크는 기록 ID를 유지한다", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  const calls = []
  window.history.replaceState(null, "", "/?page=history&worktree=explicit-checkout")
  try {
    render(
      createElement(App, {
        api: {
          executionLogs: async (id) => {
            calls.push(id)
            return {
              items: [
                {
                  id: "retained",
                  kind: "unit",
                  intent: "Recorded command",
                  state: "finished",
                  outcome: "passed",
                  createdAt: "2026-01-01T00:00:00Z",
                },
              ],
              nextCursor: null,
            }
          },
        },
      }),
    )
    const link = await screen.findByRole("link", { name: "Review", exact: true })
    assert.equal(link.getAttribute("href"), "?page=review&kind=unit&id=retained")
    assert.deepEqual(calls, ["explicit-checkout"])
    assert.equal(screen.queryByRole("combobox"), null)
  } finally {
    cleanup()
    window.history.replaceState(null, "", "/")
  }
})

test("잘못된 검토 링크는 네트워크 호출 없이 진단하고 다른 실행으로 대체하지 않는다", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  window.history.replaceState(null, "", "/?page=review&kind=unknown&id=recorded")
  try {
    render(
      createElement(App, {
        api: new Proxy(
          {},
          {
            get() {
              throw new Error("잘못된 링크는 조회하면 안 된다")
            },
          },
        ),
      }),
    )
    assert.equal(screen.getByRole("alert").textContent, "Invalid execution link.")
    assert.ok(screen.getByRole("heading", { name: "Open an execution from chat" }))
  } finally {
    cleanup()
    window.history.replaceState(null, "", "/")
  }
})

test("뷰어 안의 기록 링크는 문서를 다시 열지 않고 정확한 실행으로 이동한다", async () => {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  window.history.replaceState(null, "", "/?page=history&worktree=w1")
  try {
    render(
      createElement(App, {
        api: {
          executionLogs: async () => ({
            items: [
              {
                id: "inline-run",
                kind: "unit",
                intent: "Inline command",
                state: "finished",
                outcome: "passed",
                createdAt: "2026-01-01T00:00:00Z",
              },
            ],
            nextCursor: null,
          }),
          reviewContext: async (_kind, id) => ({
            id,
            executionId: id,
            kind: "unit",
            intent: "Inline command",
            worktreeId: "w1",
            path: "/recorded",
            state: "finished",
            outcome: "passed",
            cleanup: { state: "removed", issues: [] },
            failures: [],
            failureCount: 0,
            approval: null,
          }),
          unitRun: async () => ({ stdout: "Exact inline output", stderr: "", state: "finished" }),
        },
      }),
    )
    fireEvent.click(await screen.findByRole("link", { name: "Review", exact: true }))
    assert.equal(window.location.search, "?page=review&kind=unit&id=inline-run")
    await screen.findByText("Exact inline output")
    fireEvent.click(screen.getByRole("link", { name: "Execution history", exact: true }))
    await screen.findByRole("heading", { name: "Execution history", exact: true })
    assert.equal(window.location.search, "?page=history&worktree=w1")
  } finally {
    cleanup()
    window.history.replaceState(null, "", "/")
  }
})
