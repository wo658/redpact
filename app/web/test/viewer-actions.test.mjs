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
  "HTMLInputElement",
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
  "requestAnimationFrame",
  "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
HTMLElement.prototype.scrollIntoView = () => {}
const { createElement } = await import("react")
const { render, cleanup, screen, fireEvent } = await import("@testing-library/react")
const { createServer } = await import("vite")
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
await i18n.changeLanguage("en")
const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
const { sampleApi } = await import("./workspace-fixture.mjs")
afterEach(() => {
  cleanup()
  document.querySelectorAll("header.app-header").forEach((header) => {
    header.remove()
  })
  window.history.replaceState(null, "")
})
after(async () => {
  await server.close()
  dom.window.close()
})

function viewerApi() {
  return {
    ...sampleApi(),
    reviewContent: async () => ({
      changes: true,
      preview: true,
      unit: true,
      tests: true,
      log: true,
      environment: true,
    }),
  }
}

test("작업 검토는 Git 변경 버튼과 불필요한 병합 조회 없이 증거 탭을 연다", async () => {
  let mergeReads = 0
  const base = sampleApi()
  const api = {
    ...viewerApi(),
    mergeInspection: async (...args) => {
      mergeReads += 1
      return base.mergeInspection(...args)
    },
  }
  render(createElement(WorktreeReview, { api, worktreeId: "w1" }))
  await screen.findByRole("tab", { name: "Playwright", exact: true })
  for (const name of [/Uncommitted/, /^Merge$/, /^PR$/]) {
    assert.equal(
      Boolean(screen.queryByRole("button", { name })),
      false,
      "Git 변경은 에이전트가 수행한다",
    )
  }
  assert.equal(mergeReads, 0, "증거를 열기만 하면 병합 상태를 조회하지 않는다")
})

test("모바일 캡처는 본문에서 선택하고 실행 버튼은 공용 헤더에 유지한다", async () => {
  const file = "capture.spec.ts"
  const images = [
    {
      id: "desktop",
      name: "Desktop evidence",
      contentType: "image/png",
      viewport: { width: 1920, height: 1080 },
    },
    {
      id: "mobile",
      name: "Mobile evidence",
      contentType: "image/png",
      viewport: { width: 390, height: 844 },
    },
  ]
  const api = {
    ...viewerApi(),
    playwright: async () => ({
      settings: {
        targets: { captures: { purpose: "capture" } },
        viewport: { width: 1920, height: 1080 },
      },
      runs: [
        {
          id: "recorded",
          target: "captures",
          purpose: "capture",
          scope: "project",
          state: "finished",
          createdAt: "2026-10-23T00:00:00Z",
          finishedAt: "2026-10-23T00:00:01Z",
          settings: { viewport: { width: 1920, height: 1080 } },
          after: {
            cases: [{ id: "case", file, title: "Recorded view", errors: [], artifacts: images }],
          },
        },
      ],
    }),
    worktreePlaywrightCatalog: async () => ({
      files: [{ path: file, target: "captures", purpose: "capture" }],
      diagnostics: [],
    }),
    captureArtifact: (_id, _side, imageId) => `/evidence/${imageId}.png`,
  }
  const header = document.createElement("header")
  header.className = "app-header"
  document.body.append(header)
  render(createElement(CaptureReview, { api, worktreeId: "w1", actionsContainer: header }))
  await screen.findByRole("img", { name: "Desktop evidence" })
  const mobile = screen.getByRole("switch", { name: "Mobile", exact: true })
  assert.equal(header.contains(mobile), false, "캡처 필터가 공용 헤더 공간을 차지하지 않는다")
  assert.ok(header.contains(screen.getByRole("button", { name: "Run Playwright", exact: true })))
  assert.equal(Boolean(screen.queryByRole("img", { name: "Mobile evidence" })), false)
  fireEvent.click(mobile)
  await screen.findByRole("img", { name: "Mobile evidence" })
  assert.equal(Boolean(screen.queryByRole("img", { name: "Desktop evidence" })), false)
  fireEvent.click(mobile)
  await screen.findByRole("img", { name: "Desktop evidence" })
})
