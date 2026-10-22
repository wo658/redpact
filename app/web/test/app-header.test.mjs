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
const { render, cleanup, screen, fireEvent, waitFor } = await import("@testing-library/react")
const { createServer } = await import("vite")
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
await i18n.changeLanguage("en")
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
  localStorage.clear()
})
after(async () => {
  await server.close()
  dom.window.close()
})

test("공용 헤더가 파일 화면과 설정을 표시하고 작업공간 탭을 제거한다", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { project, sampleApi } = await import("./workspace-fixture.mjs")
  const api = {
    ...sampleApi(),
    projectFile: async () => ({ kind: "directory", path: "", entries: [] }),
  }
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  assert.equal(Boolean(screen.queryByRole("tablist", { name: "Open workspaces" })), false)
  assert.equal(screen.queryByRole("button", { name: "New tab" }), null)
  const header = document.querySelector(".app-header")
  assert.ok(header.querySelector('[data-slot="sidebar-trigger"]'))
  fireEvent.click(screen.getByRole("button", { name: "File Viewer", exact: true }))
  await waitFor(() => assert.ok(header.querySelector("h1")))
  assert.equal(header.querySelector("h1").textContent, "File Viewer")
  fireEvent.click(screen.getByRole("button", { name: "Settings", exact: true }))
  await waitFor(() => assert.equal(header.querySelector("h1")?.textContent, "Settings"))
  assert.equal(document.querySelectorAll("h1").length, 1)
  assert.equal(header.querySelectorAll('[data-slot="review-toolbar"]').length, 1)
})

test("워크트리 내용을 기다리는 동안에도 공용 헤더에 현재 페이지를 표시한다", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { project, sampleApi } = await import("./workspace-fixture.mjs")
  let requested = false
  const api = {
    ...sampleApi(),
    reviewContent: () => {
      requested = true
      return new Promise(() => {})
    },
  }
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  await waitFor(() => assert.equal(requested, true))
  assert.equal(document.querySelector(".app-header h1")?.textContent, "Worktrees")
})

test("뷰어의 테스트 실행은 범위 선택기 없이 공유 기본값을 사용한다", async () => {
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const calls = []
  const settings = { command: "echo unit", patterns: ["*.test.ts"] }
  let recorded
  const api = {
    unitTests: async () => ({
      settings,
      catalog: { files: [], diagnostics: [] },
      runs: recorded ? [recorded] : [],
    }),
    runUnitTests: async (...args) => {
      calls.push(args)
      recorded = {
        id: "viewer-default",
        state: "finished",
        outcome: "passed",
        settings,
        stdout: "Shared default run output",
        stderr: "",
        exitCode: 0,
        createdAt: "2026-10-23T00:00:00Z",
      }
      return recorded
    },
  }
  render(createElement(UnitTests, { api, worktreeId: "w1" }))
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Run Unit command", exact: true }).disabled,
      false,
    ),
  )
  const run = screen.getByRole("button", { name: "Run Unit command", exact: true })
  assert.equal(
    Boolean(screen.queryByRole("combobox", { name: "Execution scope", exact: true })),
    false,
  )
  fireEvent.click(run)
  await waitFor(() => assert.equal(calls.length, 1))
  assert.equal(calls[0][0], "w1")
  assert.equal(calls[0][1], undefined)
  await screen.findByText("Shared default run output")
})

test("모바일 탐색 서랍은 명시적 닫기 버튼으로 닫고 다시 열 수 있다", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { project, sampleApi } = await import("./workspace-fixture.mjs")
  const originalWidth = window.innerWidth
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
  try {
    render(createElement(ProjectManager, { api: sampleApi(), initialProjects: [project] }))
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar", exact: true }))
    await screen.findByRole("dialog", { name: "Sidebar", exact: true })
    const close = screen.queryByRole("button", { name: "Close sidebar", exact: true })
    assert.equal(Boolean(close), true)
    fireEvent.click(close)
    await waitFor(() =>
      assert.equal(Boolean(screen.queryByRole("dialog", { name: "Sidebar", exact: true })), false),
    )
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar", exact: true }))
    await screen.findByRole("dialog", { name: "Sidebar", exact: true })
  } finally {
    cleanup()
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth })
  }
})
