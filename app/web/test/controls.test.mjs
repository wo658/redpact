import assert from "node:assert/strict"
import { after, afterEach, test } from "node:test"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
})
for (const name of [
  "window",
  "CSSStyleSheet",
  "SVGElement",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "Event",
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
// JSDOM supplies no SVG metrics; these fixtures test rendering and interaction, not geometry.
dom.window.SVGElement.prototype.getBBox = function () {
  return { x: 0, y: 0, width: Math.max(40, (this.textContent?.length ?? 0) * 8), height: 20 }
}
dom.window.SVGElement.prototype.getComputedTextLength = function () {
  return this.getBBox().width
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
const { render, cleanup, screen, waitFor, within } = await import("@testing-library/react")
const { default: userEvent } = await import("@testing-library/user-event")
const { createServer } = await import("vite")
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { LanguageSelector } = await server.ssrLoadModule("/src/components/language-selector.tsx")
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
afterEach(() => {
  cleanup()
  localStorage.removeItem("redpact:project")
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("redpact:project-navigation:")) {
      localStorage.removeItem(key)
    }
  }
})
after(async () => {
  await server.close()
  dom.window.close()
})

// Syntax tokens split text nodes; compare the complete source line.
function sourceLine(text) {
  return (_content, element) => element.matches(".diff-code") && element.textContent === text
}

test("줄바꿈 선택을 여러 diff에 공유하고 다시 열어도 기억한다", async () => {
  await i18n.changeLanguage("en")
  localStorage.removeItem("redpact:word-wrap")
  const { GlobalSettings } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { UnifiedDiff } = await server.ssrLoadModule("/src/components/unified-diff.tsx")
  const source = { path: "example.ts", content: "  const value = 'unchanged'\n" }
  const view = render(
    createElement(
      "div",
      null,
      createElement(GlobalSettings, { api: {} }),
      createElement(UnifiedDiff, { source }),
      createElement(UnifiedDiff, { source }),
    ),
  )
  const toggles = screen.getAllByRole("switch", { name: "Word wrap" })
  assert.equal(toggles[0].getAttribute("aria-checked"), "true")
  await userEvent.click(toggles[0])
  assert.equal(document.querySelectorAll(".diff-wrap").length, 0)
  assert.equal(localStorage.getItem("redpact:word-wrap"), "false")
  view.unmount()
  render(
    createElement(
      "div",
      null,
      createElement(GlobalSettings, { api: {} }),
      createElement(UnifiedDiff, { source }),
    ),
  )
  assert.equal(
    screen.getByRole("switch", { name: "Word wrap" }).getAttribute("aria-checked"),
    "false",
  )
  assert.equal(document.querySelector(".diff-code").textContent, "  const value = 'unchanged'")
  localStorage.removeItem("redpact:word-wrap")
})

test("저장소가 차단되어도 줄바꿈을 바꾸고 세션에서 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { GlobalSettings } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { UnifiedDiff } = await server.ssrLoadModule("/src/components/unified-diff.tsx")
  const storage = Object.getOwnPropertyDescriptor(window, "localStorage")
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked")
    },
  })
  try {
    const source = { path: "example.ts", content: "text" }
    const view = render(
      createElement(
        "div",
        null,
        createElement(GlobalSettings, { api: {} }),
        createElement(UnifiedDiff, { source }),
      ),
    )
    const toggle = screen.getByRole("switch", { name: "Word wrap" })
    const previous = toggle.getAttribute("aria-checked")
    await userEvent.click(toggle)
    const next = toggle.getAttribute("aria-checked")
    assert.notEqual(next, previous)
    view.unmount()
    render(
      createElement(
        "div",
        null,
        createElement(GlobalSettings, { api: {} }),
        createElement(UnifiedDiff, { source }),
      ),
    )
    assert.equal(
      screen.getByRole("switch", { name: "Word wrap" }).getAttribute("aria-checked"),
      next,
    )
  } finally {
    Object.defineProperty(window, "localStorage", storage)
    localStorage.removeItem("redpact:word-wrap")
  }
})

test("환경변수 표에서 원문을 보고 key value를 추가하고 수정한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  let source = {
    composeFiles: ["compose.yaml"],
    dependencies: {
      payment: {
        modes: {
          mock: { env: { app: { URL: "https://example.test", TOKEN: { secret: "CLOUD_KEY" } } } },
        },
      },
    },
    tests: { timeoutMs: 1234 },
  }
  const writes = []
  const api = {
    projectDependencies: async () => ({
      valid: true,
      dependencies: source.dependencies,
      issues: [],
      file: "settings.json",
    }),
    projectConfiguration: async () => ({
      source: JSON.stringify(source),
      revision: "revision",
      issues: [],
    }),
    saveProjectConfiguration: async (_id, input) => {
      writes.push(input)
      source = JSON.parse(input.source)
      return { source: input.source, revision: "next", issues: [] }
    },
    projectSecrets: async () => [],
    projectSecretValue: async () => ({ value: "actual-cloud-value" }),
    saveProjectSecret: async () => ({ name: "CLOUD_KEY", configured: true }),
  }
  render(createElement(ProjectDependencies, { api, projectId: "project" }))
  const user = userEvent.setup({ document })
  await userEvent
    .setup({ document })
    .click(await screen.findByRole("tab", { name: "Configuration" }))
  await screen.findByText("actual-cloud-value")
  assert.equal(screen.queryByText("Execution secrets"), null)
  await user.click(screen.getByRole("button", { name: "Add environment variable" }))
  await user.type(screen.getByRole("textbox", { name: "key" }), "MOCK_MODE")
  await user.type(screen.getByRole("textbox", { name: "value" }), "enabled")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("enabled")
  assert.equal(source.dependencies.payment.modes.mock.env.app.MOCK_MODE, "enabled")
  assert.deepEqual(source.tests, { timeoutMs: 1234 })
  assert.equal(writes[0].revision, "revision")
  await user.click(screen.getByRole("button", { name: "Edit URL" }))
  const value = screen.getByRole("textbox", { name: "value" })
  await user.clear(value)
  await user.type(value, "http://mock:3000")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("http://mock:3000")
  assert.equal(source.dependencies.payment.modes.mock.env.app.URL, "http://mock:3000")
})

test("invalid dependency settings retain centered diagnostics without requesting secrets", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  let secretReads = 0
  const file = "/workspace/example/.redpact/settings.json"
  const api = {
    projectDependencies: async () => ({
      valid: false,
      file,
      issues: [
        {
          file,
          path: "unitTests.dockerfile",
          code: "schema",
          line: 105,
          column: 16,
          message: "Invalid input: expected string, received undefined",
        },
      ],
    }),
    projectSecrets: async () => {
      secretReads += 1
      return []
    },
  }
  render(createElement(ProjectDependencies, { api, projectId: "project" }))
  const diagnostic = await screen.findByText("Invalid input: expected string, received undefined")
  assert.equal(secretReads, 0)
  assert.ok(screen.getByText(`${file}:105:16 · unitTests.dockerfile · schema`))
  const centered = diagnostic.closest('[data-slot="empty"]')
  assert.ok(centered, "blocking diagnostics must use the centered content state")
  assert.ok(centered.classList.contains("flex-1"))
  assert.ok(
    screen.getByRole("region", { name: "Project dependencies" }).classList.contains("flex-1"),
  )
  assert.ok(screen.getByRole("alert"))
})

test("언어 드롭다운은 키보드 선택과 저장을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const user = userEvent.setup({ document })
  render(createElement(LanguageSelector))
  const input = screen.getByRole("combobox", { name: "Language" })
  assert.equal(input.value, "English")
  input.focus()
  await user.keyboard("{ArrowDown}")
  await user.click(await screen.findByRole("option", { name: "한국어" }))
  await waitFor(() => assert.equal(document.documentElement.lang, "ko"))
  assert.equal(localStorage.getItem("redpact:language"), "ko")
  assert.equal(input.value, "한국어")
  await user.click(input)
  await user.click(await screen.findByRole("option", { name: "English" }))
  await waitFor(() => assert.equal(document.documentElement.lang, "en"))
})

test("설정 선택은 개수와 무관하게 드롭다운이고 긴 목록만 검색한다", async () => {
  const { ChoiceList } = await server.ssrLoadModule("/src/components/choice-list.tsx")
  const { useState } = await import("react")
  const user = userEvent.setup({ document })
  const options = Array.from({ length: 6 }, (_, index) => ({
    value: String(index),
    label: `/repo/worktree-${index}`,
  }))
  function Choices({ count, disabled = false }) {
    const [value, setValue] = useState("0")
    return createElement(ChoiceList, {
      label: "Settings source",
      options: options.slice(0, count),
      value,
      onValueChange: setValue,
      compact: true,
      disabled,
    })
  }
  const view = render(createElement(Choices, { count: 5 }))
  const input = screen.getByRole("combobox", { name: "Settings source" })
  assert.equal(input.readOnly, true)
  assert.equal(screen.queryByRole("radio"), null)
  await user.click(input)
  await user.click(screen.getByRole("option", { name: options[1].label }))
  assert.equal(input.value, options[1].label)
  view.rerender(createElement(Choices, { count: 5, disabled: true }))
  assert.equal(input.disabled, true)
  view.rerender(createElement(Choices, { count: 6 }))
  assert.equal(input.readOnly, false)
  await user.clear(input)
  await user.type(input, "worktree-5")
  assert.equal(screen.getAllByRole("option").length, 1)
  await user.click(screen.getByRole("option", { name: options[5].label }))
  assert.equal(input.value, options[5].label)
  await user.clear(input)
  await user.type(input, "missing")
  assert.ok(screen.getByText("No matching options"))
  await user.keyboard("{Escape}")
  assert.equal(input.value, options[5].label)
  view.rerender(createElement(Choices, { count: 6, disabled: true }))
  assert.equal(input.disabled, true)
})

test("search selection handles long labels, empty-valued latest choice and disabled state", async () => {
  const { SearchPicker } = await server.ssrLoadModule("/src/components/search-picker.tsx")
  const { useState } = await import("react")
  const longPath = `${"packages/checkout/".repeat(12)}payment.test.ts`
  const options = [
    { value: "", label: "Latest execution" },
    { value: "old", label: longPath },
  ]
  function Picker({ disabled = false }) {
    const [value, setValue] = useState("")
    return createElement(SearchPicker, {
      label: "Execution",
      options,
      value,
      onValueChange: setValue,
      disabled,
    })
  }
  const user = userEvent.setup({ document })
  const view = render(createElement(Picker))
  const input = screen.getByRole("combobox", { name: "Execution" })
  assert.equal(input.value, "Latest execution")
  assert.equal(input.readOnly, true)
  await user.click(input)
  await user.click(await screen.findByRole("option", { name: longPath }))
  assert.equal(input.value, longPath)
  await user.click(input)
  await user.click(await screen.findByRole("option", { name: "Latest execution" }))
  assert.equal(input.value, "Latest execution")
  view.rerender(createElement(Picker, { disabled: true }))
  assert.equal(input.disabled, true)
})

test("source disclosures retain original evidence and return to the live result overview", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  await i18n.changeLanguage("en")
  const user = userEvent.setup({ document })
  render(
    createElement(TestEvidence, {
      submission: {
        id: "s1",
        digest: "digest",
        parsed: [],
        files: [
          { path: "one.test.ts", source: "expect('<one>').toBe('one')" },
          { path: "two.test.ts", source: "expect(two).toBe(2)" },
        ],
      },
      run: {
        state: "finished",
        limitations: [],
        result: {
          outcome: "assertion_failed",
          errors: [],
          cases: [
            {
              name: "fails",
              file: "one.test.ts",
              state: "failed",
              errors: [
                {
                  name: "AssertionError",
                  message: "not equal",
                  stack: "Original stack\nat checkout",
                },
              ],
            },
          ],
        },
      },
    }),
  )
  assert.equal(screen.queryByRole("button", { name: "one.test.ts · Source" }), null)
  assert.ok(screen.getByText(/not equal/))
  await user.click(screen.getByRole("tab", { name: "Executed source" }))
  assert.ok(screen.getByRole("tree"))
  const two = screen.getByRole("treeitem", { name: "two.test.ts" })
  assert.ok(screen.getByText(sourceLine("expect('<one>').toBe('one')")))
  await user.click(two)
  assert.ok(screen.getByText(sourceLine("expect(two).toBe(2)")))
  assert.equal(screen.queryByText(sourceLine("expect('<one>').toBe('one')")), null)
  await user.click(screen.getByRole("treeitem", { name: "one.test.ts" }))
  assert.ok(screen.getByText("Submission s1 · Digest digest"))
  await user.click(screen.getByRole("tab", { name: "Execution results" }))
  assert.equal(screen.queryByRole("button", { name: "one.test.ts · Source" }), null)
  assert.ok(screen.getByText(/not equal/))
  assert.ok(screen.getByText("assertion_failed"))
})

test("빈 시작화면은 입력란 없이 폴더를 선택하면 바로 연결한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "new", name: "한글 project", location: { kind: "git" } }
  const calls = []
  const user = userEvent.setup({ document })
  const view = render(
    createElement(ProjectManager, {
      initialProjects: [],
      api: {
        pickDirectory: async () => ({ path: "/Users/me/한글 project " }),
        connect: async (...args) => {
          calls.push(args)
          return project
        },
        projects: async () => [project],
        worktrees: async () => [],
      },
    }),
  )
  assert.ok(
    !view.container.querySelector("form, input[name=path], input[name=name]"),
    "시작화면에는 경로와 이름 입력 폼이 없어야 한다",
  )
  assert.equal(screen.queryAllByRole("textbox").length, 0)
  assert.equal(screen.queryAllByRole("button").length, 1)
  assert.equal(screen.queryByLabelText("Language"), null)
  assert.equal(view.container.querySelector("header, footer"), null)
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  await screen.findByRole("button", { name: project.name, exact: true })
  assert.deepEqual(calls, [["/Users/me/한글 project ", undefined]])
  assert.equal(localStorage.getItem("redpact:project"), "new")
})

test("재진입은 마지막 프로젝트를 복원하고 없는 선택은 첫 프로젝트로 대체한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const projects = [
    { id: "p1", name: "First project", location: { kind: "git" } },
    { id: "p2", name: "Recent project", location: { kind: "git" } },
  ]
  const requested = []
  const api = {
    worktrees: async (id) => {
      requested.push(id)
      return []
    },
  }
  localStorage.setItem("redpact:project", "p2")
  const view = render(createElement(ProjectManager, { api, initialProjects: projects }))
  await waitFor(() => assert.deepEqual(requested, ["p2"]))
  assert.equal(screen.queryByRole("list", { name: "Projects" }), null)
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Recent project", exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: "First project" }))
  assert.equal(localStorage.getItem("redpact:project"), "p1")
  view.unmount()
  localStorage.setItem("redpact:project", "removed")
  requested.length = 0
  render(createElement(ProjectManager, { api, initialProjects: projects }))
  await waitFor(() => assert.deepEqual(requested, ["p1"]))
  assert.equal(localStorage.getItem("redpact:project"), "p1")
})

test("프로젝트 추가는 바로 시스템 창을 열고 취소와 실패 시 현재 프로젝트를 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Current project", location: { kind: "git" } }
  const added = { id: "p2", name: "Added project", location: { kind: "git" } }
  let picks = 0
  const connections = []
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      api: {
        worktrees: async () => [],
        pickDirectory: async () => {
          picks++
          if (picks === 1) {
            return { path: null }
          }
          if (picks === 2) {
            throw new Error("Picker unavailable")
          }
          return { path: "/added" }
        },
        connect: async (path) => {
          connections.push(path)
          return added
        },
        projects: async () => [project, added],
      },
      initialProjects: [project],
    }),
  )
  for (let attempt = 1; attempt <= 3; attempt++) {
    await user.click(screen.getByRole("button", { name: project.name, exact: true }))
    await user.click(await screen.findByRole("menuitem", { name: "Connect project" }))
    await waitFor(() => assert.equal(picks, attempt))
    assert.equal(screen.queryByRole("button", { name: "Open project folder" }), null)
    if (attempt < 3) {
      assert.ok(screen.getByRole("button", { name: project.name, exact: true }))
      assert.equal(localStorage.getItem("redpact:project"), "p1")
      assert.deepEqual(connections, [])
    }
    if (attempt === 2) {
      await screen.findByText("Picker unavailable")
    }
  }
  await screen.findByRole("button", { name: added.name, exact: true })
  assert.deepEqual(connections, ["/added"])
  assert.equal(localStorage.getItem("redpact:project"), "p2")
})

test("웹 데스크톱은 사이드바를 열어 두고 프로젝트를 선택해 설정을 연다", async () => {
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Actual project", location: { kind: "git" } }
  const api = {
    worktrees: async () => [],
    projects: async () => [project],
    getBranches: async () => ["main", "local"],
    getTracking: async () => ({ tracking: { mainBranch: null, hideMerged: false }, branches: [] }),
  }
  const user = userEvent.setup({ document })
  const view = render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const sidebar = view.container.querySelector('[data-slot="sidebar"]')
  assert.equal(sidebar.dataset.state, "expanded")
  await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
  assert.equal(sidebar.dataset.state, "expanded")
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: "Actual project" }))
  assert.equal(view.container.querySelector('[data-slot="sidebar"]').dataset.state, "expanded")
  await user.click(screen.getByRole("button", { name: "Project settings", exact: true }))
  assert.ok(await screen.findByRole("combobox", { name: "Main branch" }))
  assert.equal(screen.queryByRole("button", { name: "Manage worktrees" }), null)
  assert.equal(screen.queryByLabelText("Existing checkout directory"), null)
  assert.equal(screen.queryByLabelText("Work intent"), null)
})

test("웹 헤더는 열린 작업공간 탭을 제공하고 페이지 선택은 현재 화면으로 전환한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Actual project", location: { kind: "git" } }
  const api = {
    worktrees: async () => [],
    projects: async () => [project],
    getBranches: async () => ["main"],
    getTracking: async () => ({ tracking: { mainBranch: null, hideMerged: false }, branches: [] }),
  }
  const user = userEvent.setup({ document })
  const view = render(createElement(ProjectManager, { api, initialProjects: [project] }))
  assert.equal(screen.queryByRole("button", { name: "Go back" }), null)
  assert.equal(screen.queryByRole("button", { name: "Go forward" }), null)
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(screen.getByRole("heading", { name: "Settings", level: 1 }))
  await user.click(screen.getByRole("button", { name: "Project settings", exact: true }))
  assert.ok(await screen.findByRole("combobox", { name: "Main branch" }))
  await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
  assert.equal(view.container.querySelector('[data-slot="sidebar"]').dataset.state, "expanded")
  assert.ok(screen.getByRole("button", { name: "Toggle Sidebar" }))
})

test("워크트리 탭은 Merge와 같은 본문 줄에 표시되고 키보드 전환과 화면 왕복을 지원한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const { project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const user = userEvent.setup({ document })
  const view = render(
    createElement(ProjectManager, {
      api: {
        ...sampleApi(),
        gitDiff: async () => ({
          available: true,
          patch:
            "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
          omitted: [],
        }),
        executionLogs: async () => {
          throw new Error("History unavailable")
        },
        environments: async () => {
          throw new Error("Environment unavailable")
        },
      },
      initialProjects: [project],
    }),
  )
  const diff = await screen.findByRole("tab", { name: "Diff", exact: true })
  const header = view.container.querySelector(".app-header")
  assert.equal(header.contains(diff), false, "제목 헤더에는 리뷰 탭이 없어야 한다")
  const toolbar = diff.closest('[data-slot="review-toolbar"]')
  assert.ok(toolbar, "리뷰 탭은 본문 도구 모음에 있어야 한다")
  assert.ok(
    toolbar.contains(screen.getByRole("button", { name: "Merge", exact: true })),
    "탭과 Merge는 같은 도구 모음에 있어야 한다",
  )
  for (const action of toolbar.querySelectorAll('[data-slot="button"]')) {
    assert.ok(action.classList.contains("rounded-full"), "리뷰 액션은 탭과 같은 둥근 형태여야 한다")
    assert.ok(action.classList.contains("h-7"), "리뷰 액션은 탭과 같은 높이여야 한다")
    assert.ok(action.classList.contains("text-xs"), "리뷰 액션은 작은 글자 크기를 사용해야 한다")
  }
  assert.equal(screen.getAllByRole("tablist").length, 2)
  assert.deepEqual(
    Array.from(toolbar.querySelectorAll('[role="tab"]'), (tab) => tab.textContent),
    ["Diff", "Playwright", "Unit Test", "Integration Test", "Log", "Environment"],
  )
  const log = screen.getByRole("tab", { name: "Log", exact: true })
  await user.click(log)
  assert.equal(log.getAttribute("aria-selected"), "true")
  assert.ok(await screen.findByRole("tabpanel", { name: "Log", exact: true }))
  await user.keyboard("{ArrowRight}")
  await waitFor(() =>
    assert.equal(
      screen.getByRole("tab", { name: "Environment", exact: true }).getAttribute("aria-selected"),
      "true",
    ),
  )
  await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
  assert.ok(toolbar.contains(screen.getByRole("tab", { name: "Diff", exact: true })))
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(header.querySelector('[role="tablist"]'))
})

test("실행 결과에서 저장된 소스를 열고 돌아올 수 있다", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(TestEvidence, {
      submission: { id: "s1", digest: "digest", files: [], parsed: [] },
      run: {
        state: "finished",
        limitations: [],
        result: {
          outcome: "assertion_failed",
          errors: [],
          cases: [
            { name: "accepts order", file: "orders.test.ts", state: "passed", errors: [] },
            {
              name: "rejects order",
              file: "orders.test.ts",
              state: "failed",
              errors: [{ name: "AssertionError", message: "expected 422, received 201" }],
            },
          ],
        },
      },
    }),
  )
  assert.equal(Boolean(screen.queryByRole("table")), false)
  assert.equal(screen.queryByRole("textbox", { name: "Search tests" }), null)
  assert.ok(screen.getByRole("heading", { name: "accepts order" }))
  assert.ok(screen.getByRole("heading", { name: "rejects order" }))
  assert.ok(screen.getByText(/expected 422, received 201/))
  const failedGroup = screen.getByRole("region", { name: "Failed" })
  const detail = screen.getByRole("tab", { name: "Executed source" })
  assert.ok(failedGroup)
  assert.ok(screen.getByRole("tree"))
  assert.equal(screen.queryByText("passed"), null)
  await user.click(detail)
  assert.ok(screen.getByRole("tabpanel", { name: "Executed source" }))
  assert.equal(Boolean(screen.queryByRole("tab", { name: "Result" })), false)
  assert.equal(Boolean(screen.queryByRole("tab", { name: "Execution details" })), false)
  assert.equal(Boolean(screen.queryByRole("tab", { name: "Submitted tests" })), false)
  assert.equal(screen.queryByRole("button", { name: /accepts order/ }), null)
  await user.click(screen.getByRole("tab", { name: "Execution results" }))
  assert.ok(screen.getByRole("heading", { name: "accepts order" }))
  assert.ok(screen.getByText(/expected 422, received 201/))
})

test("사이드바 이동은 현재 탭을 바꾸고 명시적으로 연 탭만 닫는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      api: {
        ...sampleApi(),
        worktrees: async (projectId) => [
          {
            id: "second-worktree",
            projectId,
            checkoutRoot: "/second/feature",
            branch: "feature/second",
          },
        ],
      },
      initialProjects: [project],
    }),
  )
  const tabs = () => within(screen.getByRole("tablist", { name: "Open workspaces" }))
  await screen.findByRole("button", { name: "feature/second", exact: true })
  await user.click(screen.getByRole("button", { name: "New tab", exact: true }))
  assert.equal(tabs().getAllByRole("tab").length, 2)
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  await user.click(screen.getByRole("button", { name: "feature/second", exact: true }))
  await waitFor(() => assert.equal(tabs().getAllByRole("tab").length, 2))
  assert.equal(tabs().getAllByRole("tab")[1].getAttribute("aria-selected"), "true")
  await user.click(tabs().getAllByRole("button", { name: /Close / })[1])
  assert.equal(tabs().getAllByRole("tab").length, 1)
  assert.ok(screen.getByRole("button", { name: "feature/second", exact: true }))
})

test("global settings remain available without a worktree", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Dependencies project", location: { kind: "git" } }
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      api: {
        worktrees: async () => [],
        getBranches: async () => ["main", "local"],
        getTracking: async () => ({
          projectRoot: "/repo",
          tracking: { mainBranch: null, hideMerged: false },
          branches: [],
        }),
      },
      initialProjects: [project],
    }),
  )
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await screen.findByRole("button", { name: "Settings", exact: true })
  assert.ok(screen.getByRole("button", { name: "Dependencies", exact: true }))
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(screen.getByRole("combobox", { name: "Language" }))
  assert.equal(screen.queryByRole("region", { name: "Dependency settings" }), null)
  assert.equal(screen.queryByRole("tab", { name: "Diff" }), null)
})

const dependencyWorktrees = [
  { id: "w1", checkoutRoot: "/repo/local", attachment: "attached" },
  { id: "w2", checkoutRoot: "/repo/feature", attachment: "attached" },
  { id: "detached", checkoutRoot: "/repo/old", attachment: "detached" },
]
const dependencyCatalog = {
  valid: true,
  file: ".redpact/settings.json",
  digest: "identity-one",
  issues: [],
  bundle: { files: [{ path: "compose.yaml", sha256: "compose-identity" }] },
  dependencies: {
    payments: {
      modes: {
        isolated: { services: ["payments"], env: { app: { URL: "http://payments:8080" } } },
        mock: {
          env: {
            app: {
              MODE: "mock",
              OLD_KEY: { unset: true },
              TOKEN: { secret: "PAYMENT_TOKEN" },
              EMPTY: "",
            },
          },
        },
      },
    },
    llm: { modes: { mock: {} } },
  },
}

async function chooseDependencyMode(user, dependency, mode) {
  await user.click(screen.getByRole("button", { name: "Select dependency" }))
  await user.click(await screen.findByRole("menuitemradio", { name: dependency, exact: true }))
  await user.click(
    screen.getByRole("tab", {
      name:
        { isolated: "Per-environment", mock: "Mock", remote: "Remote connection" }[mode] ?? mode,
      exact: true,
    }),
  )
}

test("project catalog browses definitions without execution, preserves values and resets sources", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const calls = []
  const api = {
    projectSecretValue: async () => ({ value: "actual-payment-token" }),
    projectDependencies: async (id) => {
      calls.push(id)
      return id === "w1"
        ? dependencyCatalog
        : {
            valid: false,
            file: ".redpact/settings.json",
            issues: [
              {
                code: "missing",
                path: "dependencies",
                file: ".redpact/settings.json",
                line: 3,
                message: "Original diagnostic <missing>",
              },
            ],
          }
    },
  }
  const user = userEvent.setup({ document })
  const view = render(
    createElement(ProjectDependencies, {
      api,
      projectId: "w1",
    }),
  )
  await userEvent
    .setup({ document })
    .click(await screen.findByRole("tab", { name: "Configuration" }))
  await screen.findByText("http://payments:8080")
  assert.equal(Boolean(screen.queryByRole("heading", { name: "Dependencies", exact: true })), false)
  const props = { api, projectId: "w1" }
  assert.equal(screen.queryByRole("button", { name: "Settings information" }), null)
  assert.equal(Boolean(screen.queryByText("identity-one")), false)
  assert.equal(Boolean(screen.queryByText("compose.yaml")), false)
  await chooseDependencyMode(user, "payments", "mock")
  assert.ok(await screen.findByText("actual-payment-token"))
  assert.ok(screen.getByText("Unset"))
  assert.ok(screen.getByText("Empty string"))
  assert.deepEqual(calls, ["w1"])
  await chooseDependencyMode(user, "llm", "mock")
  assert.equal(screen.getByRole("button", { name: "Select dependency" }).textContent, "llm")
  assert.ok(screen.getByText("No environment overrides."))
  assert.equal(screen.queryByRole("radiogroup", { name: "Settings source" }), null)
  view.rerender(createElement(ProjectDependencies, { ...props, projectId: "w2" }))
  assert.ok(await screen.findByText("Original diagnostic <missing>"))
  assert.equal(screen.queryByText("identity-one"), null)
  assert.equal(screen.queryByRole("combobox", { name: "Select dependency" }), null)
  assert.deepEqual(calls, ["w1", "w2"])
  await waitFor(() => assert.deepEqual(calls, ["w1", "w2"]))
})

test("dependency source changes abort slow reads and never display stale definitions", async () => {
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const { act } = await import("@testing-library/react")
  let finishSlow
  let firstSignal
  const api = {
    projectSecrets: async () => [],
    projectDependencies: (id, signal) => {
      if (id === "w1") {
        firstSignal = signal
        return new Promise((resolve) => {
          finishSlow = resolve
        })
      }
      return Promise.resolve({
        valid: true,
        file: ".redpact/settings.json",
        issues: [],
        dependencies: {},
      })
    },
  }
  const view = render(createElement(ProjectDependencies, { api, projectId: "w1" }))
  view.rerender(createElement(ProjectDependencies, { api, projectId: "w2" }))
  assert.ok(await screen.findByText("No dependencies declared."))
  assert.equal(firstSignal.aborted, true)
  await act(async () => {
    finishSlow(dependencyCatalog)
  })
  assert.equal(screen.queryByRole("combobox", { name: "Select dependency" }), null)
})

test("dependency navigation preserves the worktree review selection and hides detached sources", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Navigation project", location: { kind: "git" } }
  const reads = []
  const api = {
    worktrees: async () => dependencyWorktrees,
    gitDiff: async (id) => {
      reads.push(id)
      return {
        available: true,
        patch:
          "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
        omitted: [],
      }
    },
    projectSecrets: async () => [],
    projectDependencies: async () => dependencyCatalog,
    getBranches: async () => ["main", "local"],
    getTracking: async () => ({ tracking: { mainBranch: null, hideMerged: false }, branches: [] }),
  }
  const user = userEvent.setup({ document })
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await screen.findAllByText("readme.txt")
  await user.click(screen.getByRole("button", { name: "Dependencies", exact: true }))
  await userEvent
    .setup({ document })
    .click(await screen.findByRole("tab", { name: "Configuration" }))
  await screen.findByText("http://payments:8080")
  assert.ok(
    screen
      .getByRole("region", { name: "Project dependencies" })
      .parentElement.classList.contains("flex-1"),
  )
  assert.equal(screen.queryByRole("tab", { name: "Diff" }), null)
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(!screen.queryByRole("radio", { name: "old" }))
  await user.click(screen.getByRole("button", { name: "feature", exact: true }))
  assert.ok(await screen.findByRole("tab", { name: "Diff", selected: true }))
  await waitFor(() => assert.deepEqual(reads, ["w1", "w2"]))
})

test("dependency transport errors recover on a server invalidation", async () => {
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const events = []
  window.EventSource = class {
    constructor() {
      events.push(this)
    }
    addEventListener() {}
    close() {}
  }
  const { LiveUpdates } = await server.ssrLoadModule("/src/components/live-updates.tsx")
  let calls = 0
  render(
    createElement(
      LiveUpdates,
      null,
      createElement(ProjectDependencies, {
        projectId: "w1",
        api: {
          projectSecrets: async () => [],
          projectDependencies: async () => {
            if (++calls === 1) {
              throw new Error("Server offline")
            }
            return dependencyCatalog
          },
        },
      }),
    ),
  )
  assert.ok(await screen.findByRole("alert"))
  assert.ok(screen.getByText("Server offline"))
  const { act } = await import("@testing-library/react")
  await act(async () => events[0].onmessage())
  await userEvent
    .setup({ document })
    .click(await screen.findByRole("tab", { name: "Configuration" }))
  assert.ok(await screen.findByText("http://payments:8080"))
  assert.equal(screen.queryByText("Server offline"), null)
})

test("worktree review offers execution dependencies without settings overrides or metadata", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  render(
    createElement(WorktreeReview, {
      worktreeId: "w1",
      api: { gitDiff: async () => ({ available: true, patch: "", omitted: [] }) },
    }),
  )
  assert.equal(Boolean(screen.queryByRole("tab", { name: "Settings", exact: true })), false)
  assert.ok(await screen.findByRole("tab", { name: "Environment", exact: true }))
  for (const label of ["Readiness not checked", "Settings identity", "Compose files"]) {
    assert.equal(Boolean(screen.queryByText(label)), false)
  }
})

test("worktree labels prefer the current branch and fall back for detached checkouts", async () => {
  const { worktreeName } = await server.ssrLoadModule("/src/lib/worktree-name.ts")
  assert.equal(worktreeName({ checkoutRoot: "/repo/order-desk", branch: "local" }), "local")
  assert.equal(worktreeName({ checkoutRoot: "/repo/feature", branch: null }), "feature")
})

test("dependency overrides show every target in separate groups and follow the mode", async () => {
  await i18n.changeLanguage("en")
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(DependencyCatalog, {
      dependencies: {
        payments: {
          modes: {
            mock: {
              env: { app: { APP_FLAG: "app-value" }, worker: { WORKER_FLAG: "worker-value" } },
            },
            isolated: { env: { app: { SINGLE_FLAG: "single-value" } } },
            remote: {},
          },
        },
      },
    }),
  )
  assert.equal(Boolean(screen.queryByRole("heading", { name: "payments" })), false)
  assert.equal(Boolean(screen.queryByRole("tablist", { name: "Target service" })), false)
  const app = screen.getByRole("region", { name: "app", exact: true })
  const worker = screen.getByRole("region", { name: "worker", exact: true })
  assert.ok(app.textContent.includes("app-value"))
  assert.ok(!app.textContent.includes("worker-value"))
  assert.ok(worker.textContent.includes("worker-value"))
  assert.ok(!worker.textContent.includes("app-value"))
  await chooseDependencyMode(user, "payments", "isolated")
  assert.ok(screen.getByText("single-value"))
  assert.equal(screen.queryByRole("tablist", { name: "Target service" }), null)
  assert.ok(screen.getByText("app", { selector: "code" }))
  await chooseDependencyMode(user, "payments", "remote")
  assert.ok(screen.getByText("No environment overrides."))
  await chooseDependencyMode(user, "payments", "mock")
  assert.ok(screen.getByText("app-value"))
  assert.ok(screen.getByText("worker-value"))
})

test("many override targets remain visible in separate groups without a selector", async () => {
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  render(
    createElement(DependencyCatalog, {
      dependencies: {
        payments: {
          modes: {
            mock: {
              env: Object.fromEntries(
                Array.from({ length: 5 }, (_, index) => [
                  `service-${index}`,
                  { VALUE: `value-${index}` },
                ]),
              ),
            },
          },
        },
      },
    }),
  )
  assert.equal(Boolean(screen.queryByRole("combobox", { name: "Target service" })), false)
  for (let index = 0; index < 5; index += 1) {
    const group = screen.getByRole("region", { name: `service-${index}`, exact: true })
    assert.ok(group.textContent.includes(`value-${index}`))
    assert.equal(group.querySelectorAll("tbody tr").length, 1)
  }
})

test("mode details show authored services without redundant headings", async () => {
  await i18n.changeLanguage("en")
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(DependencyCatalog, {
      dependencies: {
        payments: {
          modes: {
            mock: { env: { app: { MODE: "mock" } } },
            isolated: { services: ["payment-gateway"] },
          },
        },
      },
    }),
  )
  assert.equal(Boolean(screen.queryByText("No additional services.")), false)
  assert.equal(Boolean(screen.queryByText("Services started with this mode")), false)
  await chooseDependencyMode(user, "payments", "isolated")
  assert.equal(Boolean(screen.queryByText("Services started with this mode")), false)
  assert.ok(screen.getByText("payment-gateway"))
  await chooseDependencyMode(user, "payments", "mock")
  assert.equal(Boolean(screen.queryByRole("heading", { name: "Environment overrides" })), false)
  assert.ok(screen.getByText("MODE"))
})

test("dependency dropdown sits beside content-sized mode segments with keyboard navigation", async () => {
  await i18n.changeLanguage("en")
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(DependencyCatalog, {
      dependencies: {
        payments: {
          modes: {
            mock: { env: { app: { MODE: "mock-value" } } },
            isolated: { env: { app: { MODE: "multi-value" } } },
            remote: {},
          },
        },
      },
    }),
  )
  const controls = screen.getByRole("group", { name: "Dependencies" })
  assert.ok(controls.contains(screen.getByRole("button", { name: "Select dependency" })))
  const list = screen.getByRole("tablist", { name: "Dependency modes" })
  assert.ok(controls.contains(list))
  assert.ok(list.querySelector('[data-slot="tab-indicator"]'))
  for (const mode of ["Mock", "Per-environment", "Remote connection"]) {
    const tab = screen.getByRole("tab", { name: mode, exact: true })
    assert.ok(tab.className.includes("shrink-0"))
    assert.ok(!tab.className.includes("flex-1"))
  }
  await user.click(screen.getByRole("tab", { name: "Per-environment", exact: true }))
  assert.ok(screen.getByText("multi-value"))
  assert.equal(Boolean(screen.queryByText("mock-value")), false)
  await user.keyboard("{ArrowRight}")
  await waitFor(() =>
    assert.ok(screen.getByRole("tab", { name: "Remote connection", selected: true })),
  )
  assert.ok(screen.getByText("No environment overrides."))
})

test("environment columns keep key and value in both interface languages", async () => {
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language)
      const view = render(
        createElement(DependencyCatalog, { dependencies: dependencyCatalog.dependencies }),
      )
      assert.deepEqual(
        screen.getAllByRole("columnheader").map((header) => header.textContent),
        ["key", "value"],
      )
      view.unmount()
    }
  } finally {
    await i18n.changeLanguage("en")
  }
})

test("review navigation uses text-only labels and preserves keyboard selection", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const reads = []
  const api = {
    unitTests: async () => ({
      settings: null,
      catalog: { files: [{ path: "unit.ts", source: "test" }], diagnostics: [] },
      runs: [],
    }),
    playwright: async () => ({ settings: null, runs: [], error: "Capture unavailable" }),
    worktreePlaywrightCatalog: async () => ({ files: [], diagnostics: [] }),
    gitDiff: async (id, scope) => {
      reads.push([id, scope])
      return {
        available: true,
        patch:
          "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
        omitted: [],
      }
    },
    integrationTests: async () => ({
      directory: "tests",
      catalog: { files: [{ path: "tests/test.ts", source: "captured test" }], diagnostics: [] },
    }),
    submissions: async () => ({ items: [], nextCursor: null }),
  }
  const user = userEvent.setup({ document })
  const view = render(createElement(WorktreeReview, { api, worktreeId: "w1" }))
  await screen.findAllByText("readme.txt")
  assert.deepEqual(reads, [["w1", "all"]])
  assert.ok(!screen.queryByRole("tablist", { name: "Compare" }))
  for (const name of [
    "Diff",
    "Playwright",
    "Unit Test",
    "Integration Test",
    "Log",
    "Environment",
  ]) {
    const tab = screen.getByRole("tab", { name })
    assert.equal(tab.querySelector("svg"), null, `${name} uses a text-only label`)
  }
  await user.click(screen.getByRole("tab", { name: "Playwright" }))
  const mobile = await screen.findByRole("switch", { name: "Mobile" })
  const toolbar = mobile.closest('[data-slot="review-toolbar"]')
  assert.ok(toolbar, "Mobile belongs in the review header")
  assert.ok(toolbar.contains(screen.getByRole("button", { name: "Run Playwright" })))
  await user.click(mobile)
  await user.click(screen.getByRole("tab", { name: "Diff" }))
  assert.equal(screen.queryByRole("switch", { name: "Mobile" }), null)
  await user.click(screen.getByRole("tab", { name: "Playwright" }))
  assert.equal(screen.getByRole("switch", { name: "Mobile" }).getAttribute("aria-checked"), "true")
  await user.click(screen.getByRole("tab", { name: "Diff" }))
  const changes = screen.getByRole("tab", { name: "Diff" })
  assert.ok(changes.closest('[data-slot="tabs-list"]').querySelector('[data-slot="tab-indicator"]'))
  changes.focus()
  await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{Enter}")
  assert.equal(
    screen.getByRole("tab", { name: "Integration Test" }).getAttribute("aria-selected"),
    "true",
  )
  await user.click(changes)
  assert.ok(await screen.findAllByText("readme.txt"))
  assert.equal(view.container.textContent.includes("HEAD →"), false)
})

test("Log는 의도와 메타데이터를 한 행에 묶고 요청할 때만 기록을 복사한다", async () => {
  const { ExecutionLog } = await server.ssrLoadModule("/src/components/execution-log.tsx")
  const user = userEvent.setup({ document })
  const reads = [],
    writes = []
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => writes.push(text) },
  })
  const api = {
    executionLogs: async (_id, before) => ({
      items: (before ? ["unit"] : ["unit", "playwright", "integration"]).map((kind) => ({
        id: kind,
        kind,
        intent: `${kind} command <script>`,
        state: "finished",
        outcome: "passed",
        createdAt: "2026-09-12T01:00:00Z",
      })),
      nextCursor: before ? null : "integration:integration",
    }),
    copyExecutionLog: async (kind, id) => {
      reads.push([kind, id])
      return { text: `${kind} recorded output` }
    },
  }
  render(createElement(ExecutionLog, { api, worktreeId: "w1" }))
  assert.ok(await screen.findByText("Playwright"))
  const list = screen.getByRole("list", { name: "Execution" })
  assert.equal(screen.queryByRole("table"), null)
  const rows = within(list).getAllByRole("listitem")
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.ok(within(row).getByText(/command <script>/))
    assert.ok(within(row).getByText("passed"))
    assert.equal(row.querySelector("time").dateTime, "2026-09-12T01:00:00Z")
    assert.ok(within(row).getByRole("button", { name: /Copy log:/ }))
  }
  assert.equal(document.querySelector("script"), null)
  assert.deepEqual(reads, [])
  await user.click(screen.getByRole("button", { name: "Copy log: playwright command <script>" }))
  assert.ok(await screen.findByRole("button", { name: "Copied" }))
  assert.deepEqual(writes, ["playwright recorded output"])
  assert.equal(screen.queryByText("playwright recorded output"), null)
  assert.equal(screen.queryByRole("button", { name: "Back to logs" }), null)
  await user.click(screen.getByRole("button", { name: "Older executions" }))
  assert.ok(await screen.findByRole("button", { name: "Newest executions" }))
})

test("Log preserves rows and permits retry after clipboard or read failure", async () => {
  const { ExecutionLog } = await server.ssrLoadModule("/src/components/execution-log.tsx")
  const user = userEvent.setup({ document })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("Clipboard denied")
      },
    },
  })
  const api = { executionLogs: async () => ({ items: [], nextCursor: null }) }
  const view = render(createElement(ExecutionLog, { api, worktreeId: "w1" }))
  assert.ok(await screen.findByText("No executions yet"))
  const populated = {
    executionLogs: async () => ({
      items: [
        {
          id: "u",
          kind: "unit",
          intent: "Unit command",
          state: "running",
          createdAt: "2026-09-12T01:00:00Z",
        },
      ],
    }),
    copyExecutionLog: async () => ({ text: "actual" }),
  }
  view.rerender(createElement(ExecutionLog, { api: populated, worktreeId: "w1" }))
  await user.click(await screen.findByRole("button", { name: "Copy log: Unit command" }))
  assert.ok(await screen.findByText("Clipboard denied"))
  assert.ok(screen.getByText("Unit command"))
  const failed = {
    ...populated,
    copyExecutionLog: async () => {
      throw new Error("Log read failed")
    },
  }
  view.rerender(createElement(ExecutionLog, { api: failed, worktreeId: "w1" }))
  await user.click(screen.getByRole("button", { name: "Copy log: Unit command" }))
  assert.ok(await screen.findByText("Log read failed"))
})

test("project tracking settings save main branch and merged filtering and refresh the worktree list", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Tracking project", location: { kind: "git" } }
  let tracking = { mainBranch: null, hideMerged: false }
  const saved = []
  const api = {
    worktrees: async () =>
      tracking.hideMerged ? dependencyWorktrees.slice(0, 1) : dependencyWorktrees,
    gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
    dependencies: async () => dependencyCatalog,
    getBranches: async () => ["main", "local"],
    getTracking: async () => ({ branches: ["main", "local"], tracking }),
    setTracking: async (id, value) => {
      saved.push({ id, value })
      tracking = value
      return { ...project, tracking }
    },
  }
  const user = userEvent.setup({ document })
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await screen.findByText("No changes in this comparison.")
  await user.click(screen.getByRole("button", { name: "Project settings", exact: true }))
  await user.click(await screen.findByRole("combobox", { name: "Main branch" }))
  await user.click(await screen.findByRole("option", { name: "main", exact: true }))
  await user.click(screen.getByRole("button", { name: "Worktree display options" }))
  await user.click(
    await screen.findByRole("menuitemcheckbox", { name: "Hide merged worktrees", exact: true }),
  )
  await user.keyboard("{Escape}")
  await waitFor(() =>
    assert.deepEqual(saved, [
      { id: "p1", value: { mainBranch: "main", hideMerged: false } },
      { id: "p1", value: { mainBranch: "main", hideMerged: true } },
    ]),
  )
  await waitFor(() =>
    assert.equal(screen.queryByRole("button", { name: "feature", exact: true }), null),
  )
})

test("live update failures use dismissible Toasts once per outage and clear on recovery", async () => {
  await i18n.changeLanguage("en")
  const events = []
  window.EventSource = class {
    constructor() {
      events.push(this)
    }
    addEventListener(name, listener) {
      this[name] = listener
    }
    close() {
      this.closed = true
    }
  }
  const { LiveUpdates } = await server.ssrLoadModule("/src/components/live-updates.tsx")
  const { Toaster } = await server.ssrLoadModule("/src/components/ui/toast.tsx")
  const content = (worktreeId) =>
    createElement(
      Toaster,
      null,
      createElement(LiveUpdates, { worktreeId }, createElement("main", null, "Evidence")),
    )
  const view = render(content("w1"))
  const { act } = await import("@testing-library/react")
  const user = userEvent.setup({ document })
  const visibleToasts = () =>
    document.querySelectorAll('[data-slot="toast"]:not([data-ending-style])')
  await act(async () => events[0].onerror())
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  assert.ok(screen.getByText("Live updates disconnected. Reconnecting…"))
  assert.equal(view.container.querySelector('[role="alert"]'), null)
  assert.equal(view.container.textContent, "Evidence")
  await act(async () => {
    events[0].onerror()
    events[0]["watch-error"]()
  })
  assert.equal(visibleToasts().length, 1)
  await user.hover(screen.getByRole("region", { name: "Notifications" }))
  await user.click(await screen.findByRole("button", { name: "Close", exact: true }))
  await waitFor(() => assert.equal(visibleToasts().length, 0))
  await act(async () => events[0].onerror())
  assert.equal(visibleToasts().length, 0)
  await act(async () => {
    events[0].onmessage()
    events[0]["watch-error"]()
  })
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  await act(async () => events[0].onmessage())
  await waitFor(() => assert.equal(visibleToasts().length, 0))
  await act(async () => events[0].onerror())
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  view.rerender(content("w2"))
  await waitFor(() => assert.equal(visibleToasts().length, 0))
  assert.equal(events[0].closed, true)
  await act(async () => events[0].onerror())
  assert.equal(visibleToasts().length, 0)
})

test("project invalidations retain the active review tab during background list reads", async () => {
  await i18n.changeLanguage("en")
  const events = []
  window.EventSource = class {
    constructor(url) {
      this.url = url
      events.push(this)
    }
    addEventListener() {}
    close() {
      this.closed = true
    }
  }
  const { act } = await import("@testing-library/react")
  const { LiveUpdates } = await server.ssrLoadModule("/src/components/live-updates.tsx")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "scope-p", name: "Scoped project", location: { kind: "git" } }
  let resolveList
  let reads = 0
  const diffReads = new Map()
  let hiddenDiffSignal
  let evidenceReads = 0
  const api = {
    reviewContent: async () => ({
      preview: false,
      unit: false,
      tests: true,
      log: false,
      environment: false,
    }),
    projects: async () => [project],
    worktrees: async () => {
      reads++
      if (reads > 1) {
        return new Promise((resolve) => {
          resolveList = resolve
        })
      }
      return dependencyWorktrees
    },
    gitDiff: async (_worktreeId, _scope, signal) => {
      hiddenDiffSignal ??= signal
      diffReads.set(signal, (diffReads.get(signal) ?? 0) + 1)
      return {
        available: true,
        patch:
          "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
        omitted: [],
      }
    },
    integrationTests: async () => ({
      directory: "tests",
      catalog: { files: [{ path: "tests/test.ts", source: "captured test" }], diagnostics: [] },
    }),
    submissions: async () => {
      evidenceReads++
      return { items: [], nextCursor: null }
    },
  }
  const user = userEvent.setup({ document })
  render(
    createElement(
      LiveUpdates,
      null,
      createElement(ProjectManager, { api, initialProjects: [project] }),
    ),
  )
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await screen.findByRole("tab", { name: "Integration Test" })
  await user.click(screen.getByRole("tab", { name: "Integration Test" }))
  const checkout = events.find((e) => e.url.includes("worktreeId=") && !e.url.includes("scope="))
  assert.ok(!checkout.closed, "hidden Diff keeps observing whether new changes appear")
  const evidence = events.find((e) => e.url.includes("scope=tests") && !e.closed)
  assert.ok(evidence, "Test must subscribe to its source and evidence scope")
  await act(async () => evidence.onmessage())
  assert.equal(evidenceReads, 2)
  assert.equal(diffReads.get(hiddenDiffSignal), 1, "evidence must not reread hidden Diff")
  const tab = screen.getByRole("tab", { name: "Integration Test", selected: true })
  const projectEvents = events.find((e) => e.url.includes("projectId=scope-p"))
  assert.ok(projectEvents, "project list must have its own subscription")
  await act(async () => projectEvents.onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  assert.equal(
    diffReads.get(hiddenDiffSignal),
    1,
    "the hidden Diff still has no extra reads after the refresh batch",
  )
  assert.ok(tab.isConnected, "background reads must not unmount the active review")
  assert.equal(tab.getAttribute("aria-selected"), "true")
  await act(async () => resolveList(dependencyWorktrees))
  assert.equal(screen.getByRole("tab", { name: "Integration Test", selected: true }), tab)
  await act(async () => events.find((e) => e.url === "/api/events").onmessage())
  assert.equal(
    reads,
    2,
    "project catalog changes must not refresh the selected project's worktree list",
  )
  assert.equal(evidenceReads, 2, "project invalidations must not reread test evidence")
  await user.click(screen.getByRole("tab", { name: "Diff" }))
  assert.equal(evidence.closed, true)
  const resumed = events.find((e) => e.url.includes("worktreeId=") && !e.url.includes("scope="))
  assert.equal(resumed.closed, undefined)
  await act(async () => resumed.onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  assert.equal(diffReads.get(hiddenDiffSignal), 2, "returning to Diff must read a fresh snapshot")
  assert.equal(evidenceReads, 2, "hidden Test must retain its snapshot")
})

test("actual MCP Ask card sends only a future policy change and preserves its approval button", async () => {
  const { EnvironmentCard } = await server.ssrLoadModule("/src/components/mcp/cards.tsx")
  const user = userEvent.setup({ document })
  const changes = []
  let approvals = 0
  const data = {
    kind: "review",
    policy: "ask",
    token: "capability",
    review: {
      id: "r1",
      policy: "ask",
      state: "pending",
      environmentApproved: false,
      selection: { services: ["api"], select: {} },
      dependencies: {},
      path: "/project",
    },
  }
  render(
    createElement(EnvironmentCard, {
      data,
      actions: {
        busy: false,
        approve: () => {
          approvals++
        },
        changePolicy: (policy) => changes.push(policy),
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: "Approval policy for the next request" }))
  await user.click(await screen.findByRole("menuitemradio", { name: "Auto", exact: true }))
  assert.deepEqual(changes, ["auto"])
  assert.equal(approvals, 0)
  assert.ok(screen.getByRole("button", { name: "Approve environment" }))
})

test("Git read failures use Toasts, preserve the diff, and clear on recovery or scope exit", async () => {
  await i18n.changeLanguage("en")
  const events = []
  window.EventSource = class {
    constructor() {
      events.push(this)
    }
    addEventListener() {}
    close() {}
  }
  const { act } = await import("@testing-library/react")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const { Toaster } = await server.ssrLoadModule("/src/components/ui/toast.tsx")
  let failure = false
  let reads = 0
  const api = {
    gitDiff: async () => {
      reads++
      if (failure) {
        throw new Error("Directory is unavailable: /tmp/removed")
      }
      return {
        available: true,
        patch:
          "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
        omitted: [],
      }
    },
    integrationTests: async () => ({
      directory: "tests",
      catalog: { files: [{ path: "tests/test.ts", source: "captured test" }], diagnostics: [] },
    }),
    submissions: async () => ({ items: [], nextCursor: null }),
  }
  const content = (id) =>
    createElement(Toaster, null, createElement(WorktreeReview, { api, worktreeId: id }))
  const view = render(content("w1"))
  const visibleToasts = () =>
    document.querySelectorAll('[data-slot="toast"]:not([data-ending-style])')
  await screen.findAllByText("readme.txt")
  failure = true
  await act(async () => events[0].onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  assert.ok(
    screen.getByText("Directory is unavailable: /tmp/removed · Displayed changes may be outdated."),
  )
  assert.equal(view.container.querySelector('[role="alert"]'), null)
  assert.ok(screen.getAllByText("readme.txt")[0])
  const firstToast = visibleToasts()[0]
  await act(async () => events[0].onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  assert.equal(reads, 3)
  assert.equal(visibleToasts()[0], firstToast)
  failure = false
  await act(async () => events[0].onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  await waitFor(() => assert.equal(visibleToasts().length, 0))
  failure = true
  await act(async () => events[0].onmessage())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1010))
  })
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("tab", { name: "Integration Test", exact: true }))
  await waitFor(() => assert.equal(visibleToasts().length, 0))
  view.unmount()
  const initial = render(content("w2"))
  await waitFor(() => assert.equal(visibleToasts().length, 1))
  assert.equal(screen.queryByText("Loading Git changes…"), null)
  assert.equal(initial.container.querySelector('[role="alert"]'), null)
  initial.unmount()
  await waitFor(() => assert.equal(visibleToasts().length, 0))
})

test("execution selections follow worktree navigation independently of footer Settings", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const reads = []
  const project = { id: "p1", name: "Scoped settings", location: { kind: "git" } }
  const api = {
    worktrees: async () => dependencyWorktrees,
    gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
    worktreeSelection: async () => ({ selection: null }),
    worktreeDependencies: async () => ({ ...dependencyCatalog, services: ["app"] }),
    environments: async (id) => {
      reads.push(id)
      return [
        {
          id: `environment-${id}`,
          state: "ready",
          createdAt: new Date().toISOString(),
          selection: { services: [], select: {} },
        },
      ]
    },
    getBranches: async () => ["main", "local"],
    getTracking: async () => ({ tracking: { mainBranch: null, hideMerged: false }, branches: [] }),
  }
  const user = userEvent.setup({ document })
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await screen.findByText("No changes in this comparison.")
  assert.equal(Boolean(screen.queryByRole("tab", { name: "Settings", exact: true })), false)
  assert.ok(screen.getByRole("button", { name: "Dependencies", exact: true }))
  await user.click(screen.getByRole("tab", { name: "Environment", exact: true }))
  await user.click(
    await screen.findByRole("button", { name: "Environment details environment-w1" }),
  )
  await screen.findByText("environment-w1")
  assert.equal(screen.queryByRole("radiogroup", { name: "Settings source" }), null)
  assert.equal(screen.queryByRole("combobox", { name: "Language" }), null)
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(screen.getByRole("combobox", { name: "Language" }))
  assert.equal(screen.queryByText("environment-w1"), null)
  assert.equal(screen.queryByRole("button", { name: "Manage worktrees" }), null)
  assert.equal(screen.queryByRole("combobox", { name: "Main branch" }), null)
  await user.click(screen.getByRole("button", { name: "feature", exact: true }))
  await user.click(screen.getByRole("tab", { name: "Environment", exact: true }))
  await user.click(
    await screen.findByRole("button", { name: "Environment details environment-w2" }),
  )
  await screen.findByText("environment-w2")
  assert.equal(screen.queryByText("environment-w1"), null)
  assert.deepEqual(reads, ["w1", "w2"], "헤더는 환경 상세를 중복 조회하지 않는다")
})

test("project Dependencies reports shared rule diagnostics without choosing a worktree", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const reads = []
  render(
    createElement(ProjectDependencies, {
      projectId: "p1",
      api: {
        projectSecrets: async () => [],
        projectDependencies: async (id) => {
          reads.push(id)
          return {
            valid: false,
            file: "/repo/.redpact/settings.json",
            issues: [
              { code: "missing", path: "dependencies", message: "Project settings missing" },
            ],
          }
        },
      },
    }),
  )
  await screen.findByText("Project settings missing")
  assert.ok(screen.getByText("/repo/.redpact/settings.json"))
  assert.equal(screen.queryByRole("radiogroup", { name: "Settings source" }), null)
  assert.deepEqual(reads, ["p1"])
})

test("worktree Environment shows recorded selections instead of the project rule editor", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(WorktreeReview, {
      worktreeId: "w2",
      api: {
        gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
        dependencies: async () => dependencyCatalog,
        worktreeSelection: async () => ({ selection: null }),
        worktreeDependencies: async () => ({ ...dependencyCatalog, services: ["app"] }),
        environments: async () => [
          {
            id: "env-2",
            state: "completed",
            createdAt: "2026-09-08T00:00:00Z",
            selection: { services: ["app"], select: { payments: "mock" } },
          },
        ],
      },
    }),
  )
  await user.click(await screen.findByRole("tab", { name: "Environment", exact: true }))
  await user.click(await screen.findByRole("button", { name: "Environment details env-2" }))
  assert.ok(await screen.findByText("env-2"))
  assert.ok(screen.getAllByText("Mock").some((element) => element.closest("li")))
  assert.equal(screen.queryByRole("button", { name: "Select dependency" }), null)
})

test("project dependency rules remain accessible without attached worktrees", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const calls = []
  const project = { id: "p1", name: "Shared rules", location: { kind: "git" } }
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      initialProjects: [project],
      api: {
        worktrees: async () => [],
        projectSecrets: async () => [],
        projectDependencies: async (id) => {
          calls.push(id)
          return dependencyCatalog
        },
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await user.click(screen.getByRole("button", { name: "Dependencies", exact: true }))
  await userEvent
    .setup({ document })
    .click(await screen.findByRole("tab", { name: "Configuration" }))
  await screen.findByText("http://payments:8080")
  assert.equal(screen.queryByText("Attach a worktree to inspect its dependency settings."), null)
  assert.equal(screen.queryByRole("radiogroup", { name: "Settings source" }), null)
  assert.equal(screen.queryByRole("tab", { name: "Diff" }), null)
  assert.deepEqual(calls, ["p1"])
})

test("project settings live above worktrees and footer Settings contains only global preferences", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const user = userEvent.setup({ document })
  const project = { id: "p1", name: "Simple settings", location: { kind: "git" } }
  render(
    createElement(ProjectManager, {
      initialProjects: [project],
      api: {
        worktrees: async () => [],
        getBranches: async () => ["main", "local"],
        getTracking: async () => ({
          projectRoot: "/repo/root",
          tracking: { mainBranch: "main", hideMerged: false },
          branches: ["main"],
        }),
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  const projectSettings = screen.getByRole("button", { name: "Project settings", exact: true })
  assert.ok(projectSettings.closest('[data-slot="sidebar-content"]'))
  const settings = screen.getByRole("button", { name: "Settings", exact: true })
  assert.ok(settings.closest('[data-slot="sidebar-footer"]'))
  await user.click(settings)
  assert.ok(screen.getByRole("combobox", { name: "Theme" }))
  assert.ok(screen.getByRole("combobox", { name: "Language" }))
  assert.equal(screen.queryByRole("combobox", { name: "Main branch" }), null)
  await user.click(projectSettings)
  await screen.findByText("/repo/root")
  const page = screen.getByRole("region", { name: "Project settings", exact: true })
  assert.deepEqual(
    [...page.querySelectorAll('[data-slot="settings-row"]')].map((row) =>
      row.getAttribute("aria-label"),
    ),
    ["Project root directory", "Main branch"],
  )
  assert.equal(screen.queryByRole("button", { name: "Manage worktrees" }), null)
  assert.equal(screen.queryByLabelText("Existing checkout directory"), null)
  assert.equal(screen.queryByRole("button", { name: "Create worktree" }), null)
})

test("worktree review exposes environments and evidence without checkout settings", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const user = userEvent.setup({ document })
  const reads = []
  render(
    createElement(WorktreeReview, {
      worktreeId: "auto-worktree",
      api: {
        gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
        worktreeSelection: async () => ({ selection: null }),
        worktreeDependencies: async () => ({ ...dependencyCatalog, services: ["app"] }),
        environments: async (id) => {
          reads.push(id)
          return [
            {
              id: "env-one",
              state: "ready",
              createdAt: "2026-09-08T00:00:00Z",
              selection: { services: ["app"], select: { payments: "mock" } },
              endpoints: { app: { host: "127.0.0.1", port: 45678 } },
              resources: [{ kind: "container", id: "container-one" }],
              errors: [],
            },
          ]
        },
      },
    }),
  )
  assert.ok(!screen.queryByRole("tab", { name: "Settings" }))
  assert.ok(!screen.queryByRole("tab", { name: "Dependencies" }))
  await user.click(await screen.findByRole("tab", { name: "Environment", exact: true }))
  await user.click(await screen.findByRole("button", { name: "Environment details env-one" }))
  await screen.findByText("env-one")
  assert.ok(screen.getAllByText("Mock").some((element) => element.closest("li")))
  assert.ok(screen.getByText("container-one"))
  assert.ok(screen.getByText("127.0.0.1:45678"))
  assert.deepEqual(reads, ["auto-worktree"], "환경 상세는 패널에서만 조회한다")
})
test("shared file tree keeps accessible selection in sync with the other review tab", async () => {
  const { FileList } = await server.ssrLoadModule("/src/components/changed-file-list.tsx")
  const files = [
    { path: "button.story.tsx", additions: 0, deletions: 0 },
    { path: "checkout.story.tsx", additions: 0, deletions: 0 },
  ]
  const props = {
    files,
    onSelect() {},
    label: "Review files",
    selectedPath: "button.story.tsx",
  }
  const view = render(createElement(FileList, props))
  assert.equal(
    screen.getByRole("treeitem", { name: /button.story/ }).getAttribute("aria-selected"),
    "true",
  )
  view.rerender(createElement(FileList, { ...props, selectedPath: "checkout.story.tsx" }))
  assert.equal(
    screen.getByRole("treeitem", { name: /checkout.story/ }).getAttribute("aria-selected"),
    "true",
  )
  assert.equal(
    screen.getByRole("treeitem", { name: /button.story/ }).getAttribute("aria-selected"),
    "false",
  )
})
test("언어를 바꿔도 실행한 소스를 그대로 보여주고 주석 설명을 재구성하지 않는다", async () => {
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const submission = {
    id: "submission-123",
    digest: "abc123",
    files: [{ path: "src/checkout.test.ts", source: 'expect("<customer>").toBe("paid")' }],
    parsed: [
      {
        path: "src/checkout.test.ts",
        review: {
          scenarios: [
            {
              title: "Persist order",
              intent: "Original test intent",
              assertions: [
                {
                  code: "expect(response.status).toBe(201)",
                  reason: "Accept the order",
                  observed: "unknown",
                },
                {
                  code: "expect(await readStock()).toBe(8)",
                  reason: "Deduct ordered stock",
                  observed: "unknown",
                },
              ],
            },
          ],
          limitations: ["Original source limitation"],
        },
      },
    ],
  }
  for (const language of ["en", "ko"]) {
    await i18n.changeLanguage(language)
    const view = render(createElement(TestEvidence, { submission, run: null }))
    assert.ok(screen.getByText(i18n.t("No recorded result")))
    const user = userEvent.setup({ document })
    await user.click(screen.getByRole("tab", { name: i18n.t("Executed source"), exact: true }))
    const detail = screen.getByRole("tabpanel", { name: i18n.t("Executed source") })
    assert.equal(detail.querySelectorAll('[data-slot="timeline-item"]').length, 0)
    assert.equal(detail.querySelector('[data-completed="true"]'), null)
    assert.equal(screen.queryByText("Original test intent"), null)
    assert.ok(screen.getByText(sourceLine('expect("<customer>").toBe("paid")')))
    assert.ok(detail.textContent.includes("submission-123"))
    assert.ok(detail.textContent.includes("abc123"))
    assert.equal(detail.querySelector("customer"), null)
    view.unmount()
  }
  await i18n.changeLanguage("en")
})
test("environment pickers preserve invalid choices for explicit recovery in both languages", async () => {
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  for (const language of ["en", "ko"]) {
    await i18n.changeLanguage(language)
    const writes = []
    const view = render(
      createElement(WorktreeEnvironments, {
        worktreeId: "a",
        api: {
          environments: async () => [],
          worktreeSelection: async () => ({
            selection: { services: ["app", "removed"], select: { payments: "retired" } },
          }),
          worktreeDependencies: async () => ({
            valid: true,
            services: ["app"],
            dependencies: { payments: { modes: { mock: {}, remote: {} } } },
          }),
          setWorktreeSelection: async (_id, selection) => {
            writes.push(selection)
            return { selection }
          },
        },
      }),
    )
    const user = userEvent.setup({ document })
    await screen.findByRole("button", { name: i18n.t("Remove unavailable choices") })
    assert.equal(screen.queryByRole("button", { name: i18n.t("Start manual environment") }), null)
    assert.equal(screen.getByRole("button", { name: i18n.t("Save selection") }).disabled, true)
    await user.click(screen.getByRole("button", { name: i18n.t("Remove unavailable choices") }))
    assert.equal(screen.getByRole("button", { name: i18n.t("Save selection") }).disabled, true)
    const picker = screen.getByRole("combobox", { name: "payments" })
    picker.focus()
    await user.keyboard("{ArrowDown}")
    await screen.findByRole("option", { name: i18n.t("Mock") })
    await user.keyboard("{Home}{Enter}")
    await waitFor(() => assert.equal(picker.value, i18n.t("Mock")))
    await user.click(screen.getByRole("button", { name: i18n.t("Save selection") }))
    await screen.findByText(i18n.t("Selection saved."))
    assert.deepEqual(writes, [{ services: ["app"], select: { payments: "mock" } }])
    view.unmount()
  }
  await i18n.changeLanguage("en")
})

test("environment cleanup failures and retry remain available with details collapsed", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const selection = { services: ["app"], select: {} }
  const environment = {
    id: "failed-cleanup",
    lifecycle: "run",
    state: "stop_failed",
    createdAt: "2026-09-11",
    selection,
    endpoints: {},
    errors: ["Docker removal failed"],
  }
  const stopped = []
  render(
    createElement(WorktreeEnvironments, {
      worktreeId: "a",
      api: {
        environments: async () => [environment],
        worktreeSelection: async () => ({ selection }),
        worktreeDependencies: async () => ({ valid: true, services: ["app"], dependencies: {} }),
        stopEnvironment: async (id) => {
          stopped.push(id)
          return { ...environment, state: "stopped", errors: [] }
        },
      },
    }),
  )
  await screen.findByText("Docker removal failed")
  const retry = screen.queryByRole("button", { name: "Retry removal" })
  assert.ok(retry, "Cleanup can be retried directly from the summary")
  assert.equal(
    screen
      .getByRole("button", { name: "Environment details failed-cleanup" })
      .getAttribute("aria-expanded"),
    "false",
  )
  const user = userEvent.setup({ document })
  await user.click(retry)
  assert.ok(await screen.findByRole("button", { name: "Stopped environments (1)" }))
  assert.deepEqual(stopped, ["failed-cleanup"])
  assert.equal(screen.queryByText("Docker removal failed"), null)
})

test("실패한 환경은 Agent에 전달할 보존 진단과 리소스 맥락을 만든다", async () => {
  await i18n.changeLanguage("en")
  const { EnvironmentRow } = await server.ssrLoadModule("/src/components/environment-row.tsx")
  render(
    createElement(EnvironmentRow, {
      environment: {
        id: "failed-environment",
        lifecycle: "manual",
        state: "failed",
        createdAt: "2026-09-19",
        selection: { services: ["app"], select: {} },
        endpoints: {},
        resources: [{ kind: "container", id: "app-1", service: "app" }],
        errors: ["Environment preparation failed"],
      },
      api: {},
      onChange: () => {},
    }),
  )
  assert.ok(await screen.findByRole("heading", { name: "Copy recovery context" }))
  assert.ok(screen.getByText(/preparation.log/))
  assert.ok(screen.getByText(/container:app-1/))
})

test("environment modes use compact pickers and save only the edited worktree selection", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const selection = { services: ["app"], select: { payments: "mock" } }
  const writes = []
  const api = {
    environments: async () => [],
    worktreeSelection: async () => ({ selection }),
    worktreeDependencies: async () => ({
      valid: true,
      services: ["app"],
      dependencies: { payments: { modes: { mock: {}, isolated: {}, remote: {} } } },
    }),
    setWorktreeSelection: async (id, next) => {
      writes.push([id, next])
      return { selection: next }
    },
    prepareEnvironment: async () => {
      throw new Error("Selection must not start resources")
    },
  }
  render(createElement(WorktreeEnvironments, { api, worktreeId: "a" }))
  await screen.findByRole("button", { name: "Save selection" })
  const picker = screen.queryByRole("combobox", { name: "payments" })
  assert.ok(picker, "Each dependency exposes one compact mode picker")
  const modes = screen.getByRole("group", { name: "Dependency modes" })
  assert.ok(modes.contains(picker))
  assert.equal(screen.queryByRole("table", { name: "Dependency modes" }), null)
  assert.equal(picker.value, i18n.t("Mock"))
  assert.equal(screen.queryByRole("radio", { name: "Per-environment" }), null)
  const user = userEvent.setup({ document })
  await user.click(picker)
  await user.click(await screen.findByRole("option", { name: "Remote connection" }))
  assert.deepEqual(writes, [])
  await user.click(screen.getByRole("button", { name: "Save selection" }))
  await screen.findByText("Selection saved.")
  assert.deepEqual(writes, [["a", { services: ["app"], select: { payments: "remote" } }]])
})

test("environment summaries hide resource details and stopped history until expanded", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const selection = { services: ["app"], select: { payments: "mock" } }
  const environment = {
    id: "manual-active",
    lifecycle: "run",
    state: "ready",
    createdAt: "2026-09-11T00:00:00Z",
    selection,
    endpoints: { app: { host: "127.0.0.1", port: 32100 } },
    resources: [
      {
        kind: "container",
        id: "container-evidence",
        service: "app",
        image: "app:recorded",
        status: "running",
      },
    ],
  }
  render(
    createElement(WorktreeEnvironments, {
      worktreeId: "a",
      api: {
        environments: async () => [
          environment,
          { ...environment, id: "automatic-old", lifecycle: "run", state: "stopped" },
        ],
        worktreeSelection: async () => ({ selection }),
        worktreeDependencies: async () => ({
          valid: true,
          services: ["app"],
          dependencies: { payments: { modes: { mock: {} } } },
        }),
      },
    }),
  )
  await screen.findByRole("button", { name: "Save selection" })
  assert.equal(
    screen.queryByRole("list", { name: "Resources" }),
    null,
    "Resource evidence starts collapsed",
  )
  assert.equal(screen.queryByRole("list", { name: "Endpoints" }), null)
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Environment details manual-active" }))
  const resources = await screen.findByRole("list", { name: "Resources" })
  const resource = within(resources).getByRole("listitem")
  for (const value of ["container", "container-evidence", "app", "app:recorded", "running"]) {
    assert.ok(within(resource).getByText(value))
  }
  const endpoints = screen.getByRole("list", { name: "Endpoints" })
  assert.ok(within(endpoints).getByText("app"))
  assert.ok(within(endpoints).getByText("127.0.0.1:32100"))
  const recordedModes = screen.getByRole("list", { name: "Dependency modes" })
  assert.ok(within(recordedModes).getByText("payments"))
  assert.ok(within(recordedModes).getByText("Mock"))
  assert.ok(screen.getByText("container-evidence"))
  assert.ok(screen.getByText("127.0.0.1:32100"))
  assert.equal(screen.queryByRole("button", { name: "Environment details automatic-old" }), null)
  await user.click(screen.getByRole("button", { name: "Stopped environments (1)" }))
  assert.ok(await screen.findByRole("button", { name: "Environment details automatic-old" }))
})

test("environment selection changes preserve the running execution evidence", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const selection = { services: ["app"], select: { payments: "mock" } }
  render(
    createElement(WorktreeEnvironments, {
      worktreeId: "a",
      api: {
        environments: async () => [
          {
            id: "running",
            lifecycle: "run",
            state: "ready",
            createdAt: "2026-09-11",
            selection,
            endpoints: {},
          },
        ],
        worktreeSelection: async () => ({ selection }),
        worktreeDependencies: async () => ({
          valid: true,
          services: ["app"],
          dependencies: { payments: { modes: { mock: {}, remote: {} } } },
        }),
      },
    }),
  )
  await screen.findByRole("button", { name: "Save selection" })
  const message =
    "Selected choices differ from an existing environment. Start a new environment to apply them."
  assert.equal(screen.queryByText(message), null)
  const picker = screen.queryByRole("combobox", { name: "payments" })
  assert.ok(picker)
  const user = userEvent.setup({ document })
  await user.click(picker)
  await user.click(await screen.findByRole("option", { name: "Remote connection" }))
  assert.equal(screen.queryByText(message), null)
  await user.click(screen.getByRole("button", { name: "Environment details running" }))
  assert.ok(
    within(screen.getByRole("list", { name: "Dependency modes" })).getByText(i18n.t("Mock"), {
      exact: true,
    }),
  )
})

test("worktree choices save independently and never prepare an environment", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const user = userEvent.setup({ document })
  const saved = new Map([
    ["a", { services: ["app"], select: { payments: "mock" } }],
    ["b", { services: ["worker"], select: { payments: "isolated" } }],
  ])
  const writes = []
  const api = {
    environments: async () => [],
    worktreeSelection: async (id) => ({ selection: saved.get(id) ?? null }),
    worktreeDependencies: async () => ({
      valid: true,
      services: ["app", "worker"],
      dependencies: { payments: { modes: { mock: {}, isolated: {} } } },
    }),
    setWorktreeSelection: async (id, selection) => {
      writes.push(id)
      saved.set(id, selection)
      return { selection }
    },
  }
  const view = render(createElement(WorktreeEnvironments, { api, worktreeId: "a" }))
  await screen.findByRole("button", { name: "Save selection" })
  assert.equal(
    screen.getByRole("button", { name: "app", exact: true }).getAttribute("aria-pressed"),
    "true",
  )
  await user.click(screen.getByRole("button", { name: "worker", exact: true }))
  await user.click(screen.getByRole("button", { name: "Save selection" }))
  await screen.findByText("Selection saved.")
  assert.deepEqual(saved.get("a"), { services: ["app", "worker"], select: { payments: "mock" } })
  view.rerender(createElement(WorktreeEnvironments, { api, worktreeId: "b" }))
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "app", exact: true }).getAttribute("aria-pressed"),
      "false",
    ),
  )
  assert.deepEqual(saved.get("b"), { services: ["worker"], select: { payments: "isolated" } })
  assert.deepEqual(writes, ["a"])
})
test("dependency 도움말은 기본적으로 숨겨지고 클릭으로 열고 닫힌다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  render(
    createElement(ProjectDependencies, {
      projectId: "project",
      api: { projectDependencies: async () => ({ valid: true, dependencies: {} }) },
    }),
  )
  await screen.findByText("No dependencies declared.")
  const tabs = screen.getByRole("tablist", { name: "Project dependency views" })
  const help = screen.getByRole("button", {
    name: "About dependency modes and environment overrides",
  })
  assert.ok(help.parentElement === tabs.parentElement, "Help shares the view navigation row")
  assert.ok(tabs.parentElement.classList.contains("items-center"))
  assert.equal(screen.queryAllByRole("dialog").length, 0)
  const user = userEvent.setup({ document })
  await user.click(
    screen.getByRole("button", { name: "About dependency modes and environment overrides" }),
  )
  await screen.findByRole("dialog")
  await user.click(screen.getByRole("button", { name: "Close", exact: true }))
  await waitFor(() => assert.equal(screen.queryAllByRole("dialog").length, 0))
})

test("dependency modes show their added services even without environment overrides", async () => {
  await i18n.changeLanguage("en")
  const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")
  render(
    createElement(DependencyCatalog, {
      dependencies: {
        database: { modes: { isolated: { services: ["postgres-service"], env: {} } } },
      },
    }),
  )
  assert.ok(screen.queryByText("postgres-service"), "The mode must expose its container service")
})

test("settings page exposes authored project and instance controls", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const project = { id: "p1", name: "Settings project", location: { kind: "git" } }
  const snapshot = (value, file) => ({
    value,
    file,
    source: JSON.stringify(value),
    revision: "r1",
    issues: [],
  })
  const api = {
    worktrees: async () => [],
    getBranches: async () => ["main"],
    getTracking: async () => ({
      projectRoot: "/project",
      tracking: { mainBranch: "main", hideMerged: false },
    }),
    projectConfiguration: async () =>
      snapshot(
        {
          composeFiles: ["compose.yaml"],
          tests: { directory: "integration", timeoutMs: 15000, env: {} },
        },
        "/project/.redpact/settings.json",
      ),
    instanceSettings: async () =>
      snapshot({ server: { port: 54320 }, projects: ["/project"] }, "/data/settings.json"),
  }
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: project.name, exact: true }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  await user.click(screen.getByRole("button", { name: "Project settings", exact: true }))
  await screen.findByRole("textbox", { name: "Compose files" })
  assert.ok(
    screen.queryByRole("textbox", { name: "Compose files" }),
    "Project configuration must be editable",
  )
  assert.equal(screen.queryByRole("textbox", { name: "Dependency modes (JSON)" }), null)
  assert.equal(screen.queryByRole("spinbutton", { name: "Server port" }), null)
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(await screen.findByRole("spinbutton", { name: "Server port" }))
  assert.equal(screen.queryByRole("textbox", { name: "Log level" }), null)
  assert.equal(screen.queryByRole("textbox", { name: "Compose files" }), null)
})

test("authored settings save changed fields without materializing defaults and retain conflict drafts", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const { ApiError } = await server.ssrLoadModule("/src/lib/api.ts")
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source:
      '{"composeFiles":["compose.yaml"],"dependencies":{"db":{"modes":{"isolated":{"services":["db"]}}}}}',
    revision: "old",
    issues: [],
  }
  const saves = []
  let reject = false
  const api = {
    projectConfiguration: async () => snapshot,
    instanceSettings: async () => ({
      file: "/data/settings.json",
      source: '{"approval":"ask"}',
      revision: "instance",
      issues: [],
    }),
    saveProjectConfiguration: async (_, input) => {
      saves.push(input)
      if (reject) {
        throw new ApiError(409, "Agent changed settings", {})
      }
      return { ...snapshot, ...input, revision: "new" }
    },
  }
  render(createElement(AuthoredSettings, { api, projectId: "p1" }))
  const user = userEvent.setup({ document })
  const input = await screen.findByRole("spinbutton", { name: "Test and hook timeout (ms)" })
  await user.type(input, "20000")
  const form = input.closest("form")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(form.querySelector('button[type="submit"]'))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), {
      composeFiles: ["compose.yaml"],
      dependencies: { db: { modes: { isolated: { services: ["db"] } } } },
      tests: { timeoutMs: 20000 },
    })
    assert.equal(saves[0].revision, "old")
    assert.ok(await screen.findByText("Settings saved."))
    reject = true
    const updated = screen.getByRole("spinbutton", { name: "Test and hook timeout (ms)" })
    await user.clear(updated)
    await user.type(updated, "25000")
    await user.click(updated.closest("form").querySelector('button[type="submit"]'))
    await screen.findByText("Agent changed settings")
    assert.equal(updated.value, "25000")
    assert.equal(saves[1].revision, "new")
    assert.ok(screen.getByRole("button", { name: "Discard draft and load current file" }))
  } finally {
    globalThis.FormData = previous
  }
})

test("instance settings preserve approval and invalid nested JSON never reaches save", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const saves = []
  const instance = {
    file: "/data/settings.json",
    source: '{"approval":"ask"}',
    revision: "instance",
    issues: [],
  }
  const api = {
    projectConfiguration: async () => ({
      file: "/project/.redpact/settings.json",
      source: '{"composeFiles":["compose.yaml"]}',
      revision: "project",
      issues: [],
    }),
    instanceSettings: async () => instance,
    saveInstanceSettings: async (input) => {
      saves.push(input)
      return { ...instance, ...input, revision: "new" }
    },
    saveProjectConfiguration: async () => {
      assert.fail("Invalid JSON must not reach the server")
    },
  }
  render(
    createElement(
      "div",
      null,
      createElement(AuthoredSettings, { api }),
      createElement(AuthoredSettings, { api, projectId: "p1" }),
    ),
  )
  const user = userEvent.setup({ document })
  const port = await screen.findByRole("spinbutton", { name: "Server port" })
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.type(port, "54321")
    await user.click(port.closest("form").querySelector('button[type="submit"]'))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), { approval: "ask", server: { port: 54321 } })
    assert.equal(saves[0].revision, "instance")
    await user.click(screen.getByRole("button", { name: "Edit JSON" }))
    const env = screen.getByRole("textbox", { name: "Test environment (JSON)" })
    await user.type(env, "[[]")
    await user.click(env.closest("form").querySelector('button[type="submit"]'))
    await screen.findByText("tests.env: expected a JSON object")
    assert.equal(env.value, "[]")
  } finally {
    globalThis.FormData = previous
  }
})

test("global settings remain available in an open project without reading project configuration", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      initialProjects: [{ id: "p1", name: "Current project", location: { kind: "git" } }],
      api: {
        worktrees: async () => [],
        projectConfiguration() {
          assert.fail("Global settings must not read a project")
        },
        instanceSettings: async () => ({
          file: "/data/settings.json",
          source: "{}",
          revision: "r1",
          issues: [],
        }),
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(await screen.findByRole("spinbutton", { name: "Server port" }))
  assert.equal(screen.queryByRole("textbox", { name: "Log level" }), null)
  assert.ok(screen.getByRole("combobox", { name: "Language" }))
  assert.equal(screen.queryByRole("textbox", { name: "Compose files" }), null)
})
test("image diffs show both revisions and use the remaining review height", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const patch =
    "diff --git a/picture.png b/picture.png\nindex abc1234..def5678 100644\nBinary files a/picture.png and b/picture.png differ\n"
  const before = "data:image/png;base64,YmVmb3Jl"
  const after = "data:image/png;base64,YWZ0ZXI="
  render(
    createElement(WorktreeReview, {
      worktreeId: "images",
      api: {
        gitDiff: async () => ({ available: true, patch, omitted: [] }),
        gitImage: async () => ({ before: { dataUrl: before }, after: { dataUrl: after } }),
      },
    }),
  )
  await waitFor(() => assert.equal(screen.getAllByRole("img").length, 2))
  assert.equal(screen.getByRole("img", { name: "Before: picture.png" }).getAttribute("src"), before)
  assert.equal(screen.getByRole("img", { name: "After: picture.png" }).getAttribute("src"), after)
  const changes = screen.getByRole("region", { name: "Git changes" })
  assert.ok(changes.classList.contains("min-h-0"))
  assert.equal(changes.innerHTML.includes("65dvh"), false)
})

test("image selection aborts stale reads and distinguishes absent images from decode failures", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const { act, fireEvent } = await import("@testing-library/react")
  const user = userEvent.setup({ document })
  const patch = ["first.png", "second.svg"]
    .map(
      (path) =>
        `diff --git a/${path} b/${path}\nindex abc1234..def5678 100644\nBinary files a/${path} and b/${path} differ\n`,
    )
    .join("")
  let finishFirst
  let firstSignal
  render(
    createElement(WorktreeReview, {
      worktreeId: "images",
      api: {
        gitDiff: async () => ({ available: true, patch, omitted: [] }),
        gitImage: async (_id, path, signal) => {
          if (path === "first.png") {
            firstSignal = signal
            return new Promise((resolve) => {
              finishFirst = resolve
            })
          }
          return { before: null, after: { dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" } }
        },
      },
    }),
  )
  await waitFor(() => assert.ok(finishFirst))
  await user.click(screen.getByRole("treeitem", { name: /second.svg/ }))
  await waitFor(() => assert.ok(screen.getByRole("img", { name: "After: second.svg" })))
  assert.equal(firstSignal.aborted, true)
  assert.ok(screen.getByText("Image absent in this revision"))
  await act(async () =>
    finishFirst({ before: null, after: { dataUrl: "data:image/png;base64,c3RhbGU=" } }),
  )
  assert.equal(screen.queryByRole("img", { name: "After: first.png" }), null)
  fireEvent.error(screen.getByRole("img", { name: "After: second.svg" }))
  assert.ok(screen.getByText("This image could not be decoded."))
})

test("diff refreshes batch invalidations and wait for the active request before reading fresh state", async () => {
  const { act } = await import("react")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const previous = window.EventSource
  const events = []
  window.EventSource = class {
    constructor() {
      events.push(this)
    }
    addEventListener() {}
    close() {}
  }
  const release = Promise.withResolvers()
  let calls = 0
  const api = {
    gitDiff: async () => {
      calls += 1
      if (calls === 1) {
        await release.promise
      }
      return { available: true, patch: "", omitted: [] }
    },
  }
  try {
    render(createElement(WorktreeReview, { api, worktreeId: "slow" }))
    await waitFor(() => assert.equal(calls, 1))
    for (let i = 0; i < 12; i += 1) {
      await act(async () => {
        events[0].onmessage({ data: "{}" })
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
    }
    const during = calls
    await act(async () => {
      release.resolve()
      await release.promise
    })
    assert.equal(during, 1, "invalidations must not overlap a slow read")
    await waitFor(() => assert.equal(calls, 2), { timeout: 2000 })
    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        events[0].onmessage({ data: "{}" })
      }
    })
    assert.equal(calls, 2, "burst updates wait for the one-second batch")
    await waitFor(() => assert.equal(calls, 3), { timeout: 2000 })
  } finally {
    release.resolve()
    window.EventSource = previous
  }
})

test("unit view browses added source but runs the whole configured command without file arguments", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const calls = []
  const data = {
    settings: { cwd: "packages/api", command: "pytest", patterns: ["**/test_*.py"] },
    catalog: { files: [{ path: "test_new.py", source: "assert 1 == 1" }], diagnostics: [] },
    runs: [],
  }
  const api = {
    gitDiff: async () => ({
      available: true,
      patch:
        "diff --git a/test_new.py b/test_new.py\nnew file mode 100644\n--- /dev/null\n+++ b/test_new.py\n@@ -0,0 +1 @@\n+assert 1 == 1\n",
      omitted: [],
    }),

    unitTests: async () => data,
    runUnitTests: async (...args) => {
      calls.push(args)
      const run = {
        id: "u1",
        state: "running",
        settings: data.settings,
        createdAt: "2026-09-09",
        stdout: "",
        stderr: "",
      }
      data.runs = [run]
      return run
    },
  }
  render(createElement(UnitTests, { api, worktreeId: "w1" }))
  await screen.findAllByText("test_new.py")
  await screen.findByText(sourceLine("assert 1 == 1"))
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Run Unit command" }))
  assert.deepEqual(calls, [["w1"]])
  await screen.findByRole("button", { name: "Cancel command" })
})

test("unit command can run even when this worktree added no test files", async () => {
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  render(
    createElement(UnitTests, {
      api: {
        unitTests: async () => ({
          settings: { cwd: ".", command: "custom-test", patterns: ["**/*.spec"] },
          catalog: { files: [], diagnostics: [] },
          runs: [],
        }),
      },
      worktreeId: "w1",
    }),
  )
  await screen.findByText("No changed unit test files.")
  assert.equal(screen.getByRole("button", { name: "Run Unit command" }).disabled, false)
})

test("브라우저 저장소가 차단되어도 첫 프로젝트와 전환을 사용할 수 있다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const projects = [
    { id: "first", name: "First", location: { kind: "git" } },
    { id: "second", name: "Second", location: { kind: "git" } },
  ]
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked")
    },
  })
  try {
    const user = userEvent.setup({ document })
    render(
      createElement(ProjectManager, {
        api: { worktrees: async () => [] },
        initialProjects: projects,
      }),
    )
    await user.click(screen.getByRole("button", { name: "First", exact: true }))
    await user.click(await screen.findByRole("menuitemradio", { name: "Second" }))
    assert.ok(screen.getByRole("button", { name: "Second", exact: true }))
  } finally {
    Object.defineProperty(globalThis, "localStorage", descriptor)
  }
})

test("폴더 선택과 연결 중에는 중복 실행을 막는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectStart } = await server.ssrLoadModule("/src/components/project-start.tsx")
  const { act } = await import("@testing-library/react")
  let choose, finish, signal
  let picks = 0,
    connections = 0
  const user = userEvent.setup({ document })
  const view = render(
    createElement(ProjectStart, {
      pending: false,
      pickDirectory: (value) => {
        signal = value
        picks++
        return new Promise((resolve) => {
          choose = resolve
        })
      },
      onConnect: () => {
        connections++
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  assert.ok(screen.getByRole("button", { name: "Opening folder picker…" }).disabled)
  await act(async () => choose({ path: "/repo" }))
  assert.ok(screen.getByRole("button", { name: "Connecting project…" }).disabled)
  assert.equal(picks, 1)
  assert.equal(connections, 1)
  await act(async () => finish())
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  view.unmount()
  assert.ok(signal.aborted)
})

test("폴더 선택 취소는 연결하지 않고 오류 뒤에는 다시 선택할 수 있다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  let picks = 0,
    connections = 0
  const user = userEvent.setup({ document })
  render(
    createElement(ProjectManager, {
      initialProjects: [],
      api: {
        pickDirectory: async () => {
          picks++
          if (picks === 1) {
            return { path: null }
          }
          if (picks === 2) {
            throw new Error("Desktop unavailable")
          }
          return { path: "/repo" }
        },
        connect: async () => {
          connections++
          throw new Error("Connection failed")
        },
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  assert.equal(connections, 0)
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  await screen.findByText("Desktop unavailable")
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  await screen.findByText("Connection failed")
  await user.click(screen.getByRole("button", { name: "Open project folder" }))
  assert.equal(connections, 2)
})

test("temporary environments have no manual start and cleanup failures can be retried", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeEnvironments } = await server.ssrLoadModule(
    "/src/components/worktree-environments.tsx",
  )
  const user = userEvent.setup({ document })
  const calls = []
  const selection = { services: ["app"], select: {} }
  const environment = {
    id: "manual-1",
    lifecycle: "run",
    state: "ready",
    createdAt: "2026-09-09",
    selection,
    endpoints: {},
    errors: [],
  }
  const api = {
    environments: async () => [environment],
    worktreeSelection: async () => ({ selection }),
    worktreeDependencies: async () => ({ valid: true, services: ["app"], dependencies: {} }),
    planEnvironment: async (id, choices) => {
      calls.push(["plan", id, choices])
      return { valid: true, digest: "digest" }
    },
    prepareEnvironment: async (input) => {
      calls.push(["prepare", input])
      return environment
    },
    stopEnvironment: async (id) => {
      calls.push(["stop", id])
      return { ...environment, state: "stop_failed", errors: ["Cleanup failed"] }
    },
  }
  render(createElement(WorktreeEnvironments, { api, worktreeId: "a" }))
  await screen.findByRole("button", { name: "Save selection" })
  assert.equal(screen.queryByRole("button", { name: "Start manual environment" }), null)
  await user.click(await screen.findByRole("button", { name: "Environment details manual-1" }))
  assert.deepEqual(calls, [])
  await user.click(screen.getByRole("button", { name: "Remove environment" }))
  await screen.findByText("Cleanup failed")
  assert.ok(screen.queryByRole("button", { name: "Retry removal" }))
  assert.ok(
    screen.queryByText(
      "Removal deletes containers, volumes and captured files. Logs and test results are kept.",
    ),
  )
})

test("unit viewer separates source review from command history and preserves file selection", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const settings = { cwd: ".", command: "pnpm test", patterns: ["**/*.test.ts"] }
  render(
    createElement(UnitTests, {
      worktreeId: "w1",
      api: {
        gitDiff: async () => ({
          available: true,
          patch:
            "diff --git a/new.test.ts b/new.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/new.test.ts\n@@ -0,0 +1 @@\n+expect(actual).toBe(expected)\n",
          omitted: [],
        }),

        unitTests: async () => ({
          settings,
          catalog: {
            files: [{ path: "new.test.ts", source: "expect(actual).toBe(expected)" }],
            diagnostics: [],
          },
          runs: [
            {
              id: "u1",
              settings,
              createdAt: "2026-09-09T00:00:00Z",
              state: "finished",
              outcome: "command_failed",
              exitCode: 1,
              stdout: "Recorded output",
              stderr: "Failure detail",
              error: null,
              truncated: false,
            },
          ],
        }),
      },
    }),
  )
  await screen.findByText(sourceLine("expect(actual).toBe(expected)"))
  assert.ok(!screen.queryByText("Recorded output"), "Command output stays out of source review")
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("tab", { name: "Command results" }))
  await screen.findByText("Recorded output")
  await screen.findByText("Failure detail")
  assert.ok(
    !screen.queryByText(sourceLine("expect(actual).toBe(expected)")),
    "Source stays out of command results",
  )
  assert.ok(screen.getByRole("combobox", { name: "Command history" }))
  await user.click(screen.getByRole("tab", { name: "Code" }))
  await screen.findByText(sourceLine("expect(actual).toBe(expected)"))
})
test("단위테스트 결과를 보는 동안에도 파일 목록에서 다른 코드를 선택할 수 있다", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  render(
    createElement(UnitTests, {
      worktreeId: "w",
      api: {
        gitDiff: async () => ({
          available: true,
          patch:
            "diff --git a/one.test.ts b/one.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/one.test.ts\n@@ -0,0 +1 @@\n+first source\ndiff --git a/two.test.ts b/two.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/two.test.ts\n@@ -0,0 +1 @@\n+second source\n",
          omitted: [],
        }),

        unitTests: async () => ({
          settings: { cwd: ".", command: "pnpm test", patterns: ["*.test.ts"] },
          catalog: {
            files: [
              { path: "one.test.ts", source: "first source" },
              { path: "two.test.ts", source: "second source" },
            ],
            diagnostics: [],
          },
          runs: [],
        }),
      },
    }),
  )
  await screen.findByText("first source")
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("tab", { name: "Command results" }))
  assert.ok(screen.getByRole("tree", { name: "Changed unit test files" }))
  await user.click(screen.getByRole("treeitem", { name: /two.test.ts/ }))
  await screen.findByText("second source")
})

test("통합테스트는 변경 구간과 해당 파일의 실행 결과를 탐색한다", async () => {
  await i18n.changeLanguage("en")
  const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  render(
    createElement(TestObservation, {
      worktreeId: "w",
      api: {
        gitDiff: async () => ({
          available: true,
          patch:
            "diff --git a/tests/one.test.ts b/tests/one.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/tests/one.test.ts\n@@ -0,0 +1 @@\n+current first\ndiff --git a/tests/two.test.ts b/tests/two.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/tests/two.test.ts\n@@ -0,0 +1 @@\n+current second\n",
          omitted: [],
        }),

        integrationTests: async () => ({
          directory: "tests",
          catalog: {
            files: [
              { path: "tests/one.test.ts", source: "current first" },
              { path: "tests/two.test.ts", source: "current second" },
            ],
            diagnostics: [],
          },
        }),
        submissions: async () => ({ items: [{ id: "s" }] }),
        submission: async () => ({
          id: "s",
          files: [
            { path: "one.test.ts", source: "captured first" },
            { path: "two.test.ts", source: "captured second" },
          ],
          parsed: [],
        }),
        runs: async () => ({ items: [{ id: "r" }] }),
        run: async () => ({
          id: "r",
          state: "finished",
          result: {
            outcome: "assertion_failed",
            errors: [],
            cases: [
              { file: "one.test.ts", name: "first passed", state: "passed", errors: [] },
              {
                file: "two.test.ts",
                name: "second failed",
                state: "failed",
                errors: [{ name: "AssertionError", message: "wrong value" }],
              },
            ],
          },
        }),
      },
    }),
  )
  await screen.findByText("current first")
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("treeitem", { name: /two.test.ts/ }))
  await screen.findByText("current second")
  await user.click(screen.getByRole("tab", { name: "Execution results" }))
  await screen.findByText("second failed")
  assert.ok(!screen.queryByText("first passed"))
  await user.click(screen.getByRole("tab", { name: "Executed source" }))
  await screen.findByText("captured second")
  assert.ok(!screen.queryByText("current second"))
  assert.ok(screen.getByRole("tree", { name: "Changed integration test files" }))
})

test("통합 실행은 최근 제출본 전체를 실행하고 중복 실행과 실패를 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  let rejectRun
  const calls = []
  render(
    createElement(TestObservation, {
      worktreeId: "w",
      api: {
        integrationTests: async () => ({
          directory: "tests",
          catalog: { files: [], diagnostics: [] },
        }),
        submissions: async () => ({ items: [{ id: "submitted" }] }),
        submission: async () => ({ id: "submitted", files: [], parsed: [] }),
        runs: async () => ({ items: [] }),
        startRun: (id) => {
          calls.push(id)
          return new Promise((_, reject) => {
            rejectRun = reject
          })
        },
      },
    }),
  )
  const button = await screen.findByRole("button", { name: "Run Integration tests" })
  await waitFor(() => assert.equal(button.disabled, false))
  assert.ok(
    !screen.queryByText("Runs the latest submission in full, not the selected current file."),
  )
  assert.equal(button.title, "Runs the latest submission in full, not the selected current file.")
  await userEvent.setup({ document }).click(button)
  assert.deepEqual(calls, ["submitted"])
  assert.equal(button.disabled, true)
  rejectRun(new Error("Environment unavailable"))
  await screen.findByText("Error: Environment unavailable")
  assert.equal(button.disabled, false)
})

test("제출본이 없으면 통합 실행을 비활성화한다", async () => {
  await i18n.changeLanguage("en")
  const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  render(
    createElement(TestObservation, {
      worktreeId: "w",
      api: {
        integrationTests: async () => ({
          directory: "tests",
          catalog: { files: [], diagnostics: [] },
        }),
        submissions: async () => ({ items: [] }),
      },
    }),
  )
  assert.equal(
    (await screen.findByRole("button", { name: "Run Integration tests" })).disabled,
    true,
  )
})

test("통합 실행 접수 후 실행 중 상태를 표시하고 재실행을 막는다", async () => {
  await i18n.changeLanguage("en")
  const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  render(
    createElement(TestObservation, {
      worktreeId: "w",
      api: {
        integrationTests: async () => ({
          directory: "tests",
          catalog: { files: [], diagnostics: [] },
        }),
        submissions: async () => ({ items: [{ id: "s" }] }),
        submission: async () => ({ id: "s", files: [], parsed: [] }),
        runs: async () => ({ items: [] }),
        startRun: async () => ({ id: "r", state: "queued", result: null }),
      },
    }),
  )
  const button = await screen.findByRole("button", { name: "Run Integration tests" })
  await waitFor(() => assert.equal(button.disabled, false))
  await userEvent.setup({ document }).click(button)
  await screen.findByText("Run status: queued")
  assert.equal(button.disabled, true)
})

test("프로젝트 설정에서 단위 테스트 Dockerfile을 저장하고 다른 설정을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const initial = {
    composeFiles: ["compose.yaml"],
    dependencies: { cache: { modes: {} } },
    unitTests: {
      command: "pnpm test",
      cwd: ".",
      patterns: ["**/*.test.ts"],
      dockerfile: "unit.Dockerfile",
    },
  }
  let saved
  const doc = {
    file: "/primary/.redpact/settings.json",
    revision: "r1",
    source: JSON.stringify(initial),
    value: initial,
    issues: [],
  }
  render(
    createElement(AuthoredSettings, {
      projectId: "project",
      api: {
        projectConfiguration: async () => doc,
        saveProjectConfiguration: async (id, input) => {
          saved = { id, value: JSON.parse(input.source) }
          return { ...doc, ...input, revision: "r2" }
        },
      },
    }),
  )
  const previousFormData = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    const user = userEvent.setup({ document })
    const field = await screen.findByRole("textbox", { name: "Unit test Dockerfile" })
    await user.clear(field)
    await user.type(field, "tests/runtime.Dockerfile")
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saved?.value.unitTests.dockerfile, "tests/runtime.Dockerfile"))
    assert.equal(saved.id, "project")
    assert.deepEqual(saved.value.dependencies, initial.dependencies)
    assert.equal(saved.value.unitTests.command, "pnpm test")
  } finally {
    globalThis.FormData = previousFormData
  }
})

test("컨테이너 정리 실패는 성공한 테스트 결과를 유지하며 정리만 재시도한다", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const settings = {
    command: "pnpm test",
    cwd: ".",
    patterns: ["**/*.test.ts"],
    dockerfile: "unit.Dockerfile",
  }
  let calls = 0
  let run = {
    id: "u-cleanup",
    settings,
    state: "finished",
    outcome: "command_succeeded",
    exitCode: 0,
    createdAt: "2026-09-10",
    stdout: "passed",
    stderr: "",
    error: null,
    cleanup: { state: "failed", error: "Docker unavailable" },
  }
  render(
    createElement(UnitTests, {
      worktreeId: "wt",
      api: {
        unitTests: async () => ({ settings, catalog: { files: [], diagnostics: [] }, runs: [run] }),
        cancelUnitRun: async (id) => {
          assert.equal(id, run.id)
          calls++
          run = { ...run, cleanup: { state: "removed", error: null } }
          return run
        },
      },
    }),
  )
  const user = userEvent.setup({ document })
  await user.click(await screen.findByRole("tab", { name: "Command results" }))
  await screen.findByText("Success")
  await user.click(await screen.findByRole("button", { name: "Retry container cleanup" }))
  await waitFor(() => assert.equal(calls, 1))
  await waitFor(() =>
    assert.equal(screen.queryByRole("button", { name: "Retry container cleanup" }), null),
  )
  assert.ok(screen.getByText("Success"))
  assert.equal(screen.queryByText(/Container cleanup:/), null)
  assert.equal(screen.queryByText("stderr"), null)
  assert.equal(screen.queryByText(/Exit code:/), null)
})

test("미커밋 화면은 버릴 파일을 확인받고 정리 후 자동 머지하지 않는다", async () => {
  const { WorktreeMerge } = await server.ssrLoadModule("/src/components/worktree-merge.tsx")
  await i18n.changeLanguage("en")
  const user = userEvent.setup({ document })
  const empty = { available: true, patch: "", omitted: [] }
  let discarded = 0
  let merged = 0
  const source = {
    root: "/repo/feature",
    branch: "feature",
    head: "a",
    revision: "snapshot",
    dirty: true,
    blockedReason: null,
    files: [{ path: "new.txt", staged: false, unstaged: false, untracked: true }],
    staged: empty,
    unstaged: empty,
  }
  const inspection = {
    source,
    target: {
      ...source,
      root: "/repo",
      branch: "main",
      revision: "target",
      dirty: false,
      files: [],
    },
    targetBranch: "main",
    blockedReason: "Commit or discard all uncommitted changes before merging",
    records: [],
  }
  const api = {
    mergeInspection: async () => inspection,
    discardChanges: async (_id, revision) => {
      assert.equal(revision, "snapshot")
      discarded++
      inspection.source = { ...source, dirty: false, files: [], revision: "clean" }
      inspection.blockedReason = null
      return inspection.source
    },
    mergeWorktree: async () => {
      merged++
    },
  }
  render(
    createElement(WorktreeMerge, {
      api,
      worktreeId: "feature",
      onBack() {},
      onMerge: async () => {
        merged++
      },
    }),
  )
  await screen.findByText("new.txt")
  assert.equal(screen.getByRole("button", { name: "Merge into main" }).disabled, true)
  await user.click(screen.getByRole("button", { name: "Discard changes" }))
  assert.equal(discarded, 0)
  const dialog = screen.getByRole("alertdialog")
  assert.match(dialog.textContent, /new.txt/)
  await user.click(screen.getByRole("button", { name: "Discard all listed changes" }))
  await waitFor(() => assert.equal(discarded, 1))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Merge into main" }).disabled, false),
  )
  assert.equal(merged, 0)
})

test("복사 요청 shell은 화면별 내용을 유지하고 선택 가능한 본문을 남긴다", async () => {
  const { CopyHandoff } = await server.ssrLoadModule("/src/components/copy-handoff.tsx")
  await i18n.changeLanguage("en")
  render(
    createElement(
      CopyHandoff,
      {
        context: {
          title: "Resolve merge conflict",
          summary: "Resolve the conflict in /repo/feature.",
          fields: [],
        },
      },
      createElement("p", null, "Merge stopped before publishing."),
    ),
  )
  const user = userEvent.setup({ document })
  assert.ok(screen.getByRole("heading", { name: "Resolve merge conflict" }))
  assert.ok(screen.getByText("Merge stopped before publishing."))
  await user.click(screen.getByRole("button", { name: "Copy" }))
  assert.ok(await screen.findByRole("button", { name: "Copied" }))
  assert.ok(screen.getByText(/Resolve the conflict in \/repo\/feature\./))
})

test("오류 알림은 즉시 복사 가능한 Handoff 컨텍스트를 제공한다", async () => {
  const { Notice } = await server.ssrLoadModule("/src/components/feedback.tsx")
  await i18n.changeLanguage("en")
  const error = "Test timeout of 30000ms exceeded.\nError: apiRequestContext.get closed"
  render(createElement(Notice, { error: true }, error))
  assert.ok(screen.getByRole("heading", { name: "Problem details" }))
  const copied = []
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => copied.push(value) },
  })
  try {
    await userEvent.click(screen.getByRole("button", { name: "Copy" }))
    assert.match(
      copied[0],
      /Message: Test timeout of 30000ms exceeded\.\nError: apiRequestContext\.get closed/,
    )
  } finally {
    Object.defineProperty(navigator, "clipboard", clipboard)
  }
})

for (const outcome of ["merged", "conflict", "dirty", "target-dirty", "error"]) {
  test(`머지 버튼은 ${outcome} 결과에 맞게 바로 실행하거나 문제 모달을 연다`, async () => {
    const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
    await i18n.changeLanguage("en")
    const user = userEvent.setup({ document })
    const empty = {
      available: true,
      patch:
        "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
      omitted: [],
    }
    const source = {
      root: "/feature",
      branch: "feature",
      revision: "source",
      files: [],
      dirty: outcome === "dirty",
      blockedReason: null,
      staged: empty,
      unstaged: empty,
    }
    const record = {
      id: "result",
      state: outcome,
      sourceHead: "abc",
      targetHead: "def",
      sourceBranch: "feature",
      targetBranch: "main",
      createdAt: "2026-09-10T00:00:00Z",
      conflicts: [],
      output: "",
      resolutionRequest: "Resolve this conflict",
    }
    let merged = 0
    render(
      createElement(WorktreeReview, {
        worktreeId: "feature",
        api: {
          gitDiff: async () => ({
            available: true,
            patch:
              "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
            omitted: [],
          }),
          mergeInspection: async () => ({
            source,
            target: { ...source, dirty: outcome === "target-dirty", revision: "target" },
            targetBranch: "main",
            blockedReason:
              {
                dirty: "Commit or discard all uncommitted changes before merging",
                "target-dirty":
                  "The target worktree has uncommitted changes; organize them there first",
              }[outcome] ?? null,
            records: merged && outcome !== "error" ? [record] : [],
          }),
          mergeWorktree: async () => {
            merged++
            if (outcome === "error") {
              throw new Error("Connection failed")
            }
            return record
          },
        },
      }),
    )
    if (source.dirty) {
      await screen.findByRole("button", { name: /Uncommitted/ })
    } else {
      await waitFor(() => assert.equal(screen.queryByRole("button", { name: /Uncommitted/ }), null))
    }
    assert.equal(screen.queryByRole("dialog"), null)
    await user.click(screen.getByRole("button", { name: "Merge", exact: true }))
    if (outcome === "merged") {
      await waitFor(() => assert.equal(merged, 1))
      assert.equal(screen.queryByRole("dialog"), null)
      assert.ok(screen.getByRole("tab", { name: "Diff" }))
    } else {
      const dialog = await screen.findByRole("dialog", { name: "Worktree merge" })
      assert.equal(merged, outcome === "dirty" || outcome === "target-dirty" ? 0 : 1)
      assert.match(
        dialog.textContent,
        {
          dirty: /Commit or discard/,
          "target-dirty": /target worktree/,
          error: /Connection failed/,
          conflict: /Resolve merge issue/,
        }[outcome],
      )
      await user.click(screen.getByRole("button", { name: "Close", exact: true }))
      await waitFor(() => assert.ok(screen.queryByRole("dialog") === null, "Dialog should close"))
      assert.ok(screen.getByRole("tab", { name: "Diff" }))
    }
  })
}

test("복구 handoff는 상태와 보존된 진단을 복사 가능한 하나의 맥락으로 만든다", async () => {
  const { formatHandoffContext } = await server.ssrLoadModule("/src/components/copy-handoff.tsx")
  const text = formatHandoffContext({
    title: "Environment recovery",
    summary: "Environment preparation failed",
    fields: [
      ["Environment", "env-1"],
      ["Worktree", "/repo/feature"],
      ["Resources", "container: app-1"],
    ],
    diagnostics: [
      ["Preparation log", "compose exited 1"],
      ["Service log", "app failed healthcheck"],
    ],
  })
  assert.match(text, /Environment recovery/)
  assert.match(text, /Worktree: \/repo\/feature/)
  assert.match(text, /Preparation log:\ncompose exited 1/)
  assert.match(text, /Service log:\napp failed healthcheck/)
})

test("Playwright 리뷰는 비교 없이 저장된 현재 화면을 표시한다", async () => {
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  let starts = 0
  const artifact = { id: "image", name: "완료 화면", contentType: "image/png" }
  const scenario = {
    id: "scenario",
    title: "설정 변경",
    file: "settings.spec.ts",
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [artifact],
  }
  const run = {
    id: "run",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    baseRevision: "base",
    revision: "head",
    createdAt: "2026-09-10",
    settings: { viewport: { width: 1280, height: 840 } },
    before: { state: "finished", cases: [scenario] },
    after: { state: "finished", cases: [scenario] },
  }
  const api = {
    playwright: async () => ({ settings: {}, runs: [run] }),
    worktreePlaywrightCatalog: async () => ({
      files: run.after.cases.map((c) => ({
        path: c.file,
        target: run.target,
        purpose: "capture",
      })),
      diagnostics: [],
    }),
    runPlaywright: async () => {
      starts++
      return run
    },
    captureArtifact: (id, side, artifact) =>
      `/api/playwright-runs/${id}/${side}/artifacts/${artifact}`,
  }
  const view = render(createElement(CaptureReview, { api, worktreeId: "w" }))
  try {
    assert.ok(await screen.findByAltText("완료 화면"))
    assert.equal(screen.queryByRole("combobox", { name: "Comparison view" }), null)
    assert.equal(starts, 0)
    assert.equal(
      screen.getByAltText("완료 화면").getAttribute("src"),
      "/api/playwright-runs/run/after/artifacts/image",
    )
    assert.equal(screen.queryAllByRole("combobox").length, 0)
    assert.equal(screen.queryByRole("tab"), null)
    assert.equal(screen.queryByRole("button", { name: "Recorded execution" }), null)
    assert.equal(screen.getByAltText("완료 화면").style.maxWidth, "100%")
    assert.equal(starts, 0)
  } finally {
    view.unmount()
  }
})

test("Capture는 여러 시나리오의 모든 이미지를 선택 없이 펼쳐 보인다", async () => {
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const run = {
    id: "latest",
    target: "captures",
    purpose: "capture",
    state: "finished",
    settings: { viewport: { width: 1920, height: 1080 } },
    after: {
      cases: ["first", "second"].map((id) => ({
        id,
        title: id,
        file: "page.ts",
        status: "passed",
        errors: [],
        steps: [],
        artifacts: ["one", "two"].map((name) => ({
          id: `${id}-${name}`,
          name: `${id}-${name}`,
          contentType: "image/png",
        })),
      })),
    },
  }
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: {}, runs: [run, { ...run, id: "older" }] }),
        worktreePlaywrightCatalog: async () => ({
          files: [{ path: "page.ts", target: "captures", purpose: "capture" }],
          diagnostics: [],
        }),
        captureArtifact: (id, side, artifact) => `/${id}/${side}/${artifact}.png`,
      },
    }),
  )
  await screen.findByAltText("second-two")
  assert.equal(screen.getAllByRole("img").length, 4)
  for (const image of screen.getAllByRole("img")) {
    assert.ok(image.getAttribute("src").startsWith("/latest/after/"))
  }
  assert.equal(screen.queryAllByRole("combobox").length, 0)
})

test("현재 화면 캡처가 실패하면 과거 기준 화면으로 대체하지 않는다", async () => {
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const scenario = {
    id: "case",
    title: "설정",
    file: "app.spec.ts",
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: "before-image", name: "설정 화면", contentType: "image/png" }],
  }
  const run = {
    id: "run",
    purpose: "capture",
    state: "finished",
    outcome: "failed",
    createdAt: "now",
    settings: { viewport: { width: 1280, height: 840 } },
    before: { state: "finished", cases: [scenario] },
    after: {
      state: "finished",
      cases: [
        { ...scenario, status: "failed", errors: ["Current route is unavailable"], artifacts: [] },
      ],
    },
  }
  const view = render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: {}, runs: [run] }),
        worktreePlaywrightCatalog: async () => ({
          files: run.after.cases.map((c) => ({
            path: c.file,
            target: run.target,
            purpose: "capture",
          })),
          diagnostics: [],
        }),
        captureArtifact: () => "/saved.png",
      },
    }),
  )
  try {
    await screen.findByText("No completed screenshots in this execution.")
    assert.ok(screen.getByRole("tree"))
    assert.ok(screen.getByText("Current route is unavailable"))
    assert.equal(screen.queryByAltText("Before: 설정 화면"), null)
    assert.equal(screen.queryByAltText("After: 설정 화면"), null)
  } finally {
    view.unmount()
  }
})

test("워크트리 표시 메뉴에서 브랜치와 병합 항목을 선택하고 커밋 Diff를 연다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const base = sampleApi()
  let tracking = { mainBranch: "local", hideMerged: true }
  const api = {
    ...base,
    getTracking: async () => ({ projectRoot: "/example/redpact", tracking }),
    setTracking: async (_id, value) => {
      tracking = value
      return { ...project, tracking }
    },
    branchReviews: async () => [
      { name: "feature/without-folder", revision: "abc123", merged: false, worktrees: [] },
    ],
    branchDiff: async () => ({
      available: true,
      revision: "abc123",
      baseRevision: "base",
      omitted: [],
      patch: "",
    }),
  }
  const user = userEvent.setup({ document })
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const options = await screen.findByRole("button", { name: "Worktree display options" })
  await waitFor(() => assert.equal(options.disabled, false))
  await user.click(options)
  assert.equal(
    (await screen.findByRole("menuitemradio", { name: "Worktrees only" })).getAttribute(
      "aria-checked",
    ),
    "true",
  )
  await user.click(screen.getByRole("menuitemradio", { name: "Include local branches" }))
  await user.keyboard("{Escape}")
  await user.click(await screen.findByRole("button", { name: "feature/without-folder" }))
  assert.ok(await screen.findByText("No working directory. Only committed changes are shown."))
  assert.equal(screen.queryByRole("tab", { name: "Unit Test", exact: true }), null)
  assert.equal(tracking.showBranches, true)
  await user.click(options)
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Hide merged worktrees" }))
  await user.keyboard("{Escape}")
  assert.equal(tracking.hideMerged, false)
  await user.click(screen.getByRole("button", { name: "Project settings", exact: true }))
  assert.ok(await screen.findByRole("combobox", { name: "Main branch" }))
  assert.equal(screen.queryByRole("radiogroup", { name: "Merged worktrees" }), null)
})

test("표시 설정 저장이 실패하면 선택과 오류를 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const api = {
    ...sampleApi(),
    setTracking: async () => {
      throw new Error("Display preferences could not be saved")
    },
  }
  const user = userEvent.setup({ document })
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const options = await screen.findByRole("button", { name: "Worktree display options" })
  await waitFor(() => assert.equal(options.disabled, false))
  await user.click(options)
  await user.click(await screen.findByRole("menuitemradio", { name: "Include local branches" }))
  assert.ok(await screen.findByText("Display preferences could not be saved"))
  await user.keyboard("{Escape}")
  await user.click(options)
  assert.equal(
    (await screen.findByRole("menuitemradio", { name: "Worktrees only" })).getAttribute(
      "aria-checked",
    ),
    "true",
  )
})

test("프로젝트 Playwright 탭에서 워크트리 없이 저장된 스크린샷과 실행 당시 테스트 코드를 조회한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const scenario = {
    id: "case",
    title: "설정 화면",
    file: "app.spec.ts",
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: "image", name: "설정 패널", contentType: "image/png" }],
  }
  const run = {
    id: "record",
    target: "captures",
    purpose: "capture",
    worktreeId: "removed",
    projectRoot: "/removed/worktree",
    state: "finished",
    outcome: "passed",
    createdAt: "2026-09-10",
    settings: { viewport: { width: 1280, height: 840 } },
    before: { state: "unavailable", cases: [] },
    after: { state: "finished", cases: [scenario] },
  }
  let sourceReads = 0
  const api = {
    ...sampleApi(),
    projectPlaywrightCatalog: async () => ({ root: "/repo", settings: null, files: [] }),
    worktrees: async () => [],
    projectPlaywright: async (id) => {
      assert.equal(id, project.id)
      return { runs: [run] }
    },
    captureSource: async (id, path) => {
      assert.equal(id, "record")
      assert.equal(path, "app.spec.ts")
      sourceReads++
      return 'test("저장된 테스트", async () => {})'
    },
    captureArtifact: () => "/recorded.png",
  }
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const user = userEvent.setup({ document })
  await user.click(await screen.findByRole("button", { name: "Tests", exact: true }))
  await user.click(screen.getByRole("tab", { name: "Playwright", exact: true }))
  assert.ok(await screen.findByAltText("설정 패널"))
  assert.ok(screen.getByRole("button", { name: "Run Playwright" }))
  assert.equal(sourceReads, 0)
  await user.click(screen.getByRole("tab", { name: "Test Code" }))
  assert.ok(await screen.findByText(sourceLine('test("저장된 테스트", async () => {})')))
  assert.equal(sourceReads, 1)
  await user.click(
    within(screen.getByRole("tablist", { name: "Captures", exact: true })).getByRole("tab", {
      name: "Screenshots",
    }),
  )
  assert.ok(await screen.findByAltText("설정 패널"))
})

test("프로젝트 Playwright는 워크트리 캡처와 기능 검증 파일을 분리하고 비교를 표시하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const scenario = {
    id: "c",
    title: "캡처 절차",
    file: "screens/panel.capture.ts",
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: "png", name: "프로젝트 설정", contentType: "image/png" }],
  }
  const run = {
    id: "capture",
    target: "screens",
    purpose: "capture",
    state: "finished",
    createdAt: "2026-09-11",
    projectRoot: "/repo",
    settings: { viewport: { width: 1280, height: 840 } },
    before: { state: "finished", cases: [scenario] },
    after: { state: "finished", cases: [scenario] },
  }
  const api = {
    ...sampleApi(),
    unitTests: async () => ({
      settings: null,
      catalog: { files: [], diagnostics: [] },
      runs: [],
    }),
    projectPlaywright: async () => ({
      runs: [
        run,
        {
          ...run,
          id: "temporary",
          scope: "worktree",
          createdAt: "2026-09-12",
          after: {
            state: "finished",
            cases: [
              {
                ...scenario,
                artifacts: [{ id: "draft", name: "임시 작업 화면", contentType: "image/png" }],
              },
            ],
          },
        },
        {
          ...run,
          id: "functional",
          purpose: "functional",
          after: {
            state: "finished",
            cases: [
              {
                ...scenario,
                artifacts: [{ id: "diagnostic", name: "실패 진단", contentType: "image/png" }],
              },
            ],
          },
        },
      ],
    }),
    projectPlaywrightCatalog: async () => ({
      root: "/repo",
      settings: {},
      files: [
        { path: "screens/panel.capture.ts", target: "screens", purpose: "capture" },
        { path: "checks/save.spec.ts", target: "checks", purpose: "functional" },
      ],
    }),
    projectPlaywrightSource: async () => "test('설정을 저장한다', async () => {})",
    captureArtifact: (id) => `/saved/${id}.png`,
  }
  render(createElement(ProjectManager, { api, initialProjects: [project] }))
  const user = userEvent.setup({ document })
  await user.click(await screen.findByRole("button", { name: "Tests", exact: true }))
  await user.click(screen.getByRole("tab", { name: "Playwright", exact: true }))
  await user.click(
    within(screen.getByRole("tablist", { name: "Playwright", exact: true })).getByRole("tab", {
      name: "Screenshots",
    }),
  )
  assert.ok(await screen.findByAltText("임시 작업 화면"))
  assert.equal(screen.queryByAltText("실패 진단"), null)
  await user.click(screen.getByRole("combobox", { name: "Checkpoint" }))
  await user.click(screen.getByRole("option", { name: /프로젝트 설정/ }))
  assert.ok(screen.getByAltText("프로젝트 설정"))
  assert.equal(screen.queryByRole("radio", { name: "Side by side" }), null)
  assert.equal(screen.queryByAltText(/Before:/), null)
  await user.click(screen.getByRole("tab", { name: "Tests", exact: true }))
  assert.ok(await screen.findByRole("treeitem", { name: "save.spec.ts", exact: true }))
  assert.equal(screen.queryByRole("treeitem", { name: "panel.capture.ts", exact: true }), null)
  await user.click(screen.getByRole("treeitem", { name: "save.spec.ts", exact: true }))
  assert.ok(await screen.findByText(sourceLine("test('설정을 저장한다', async () => {})")))
})

test("PR 버튼은 읽기 전용 준비 후 명시적으로 발행하고 결과 링크를 보여준다", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeMergeActions } = await server.ssrLoadModule("/src/components/worktree-merge.tsx")
  const { sampleApi } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const calls = []
  const inspection = {
    repository: "owner/repo",
    baseBranch: "main",
    branch: "feature/ui",
    head: "a".repeat(40),
    revision: "revision-1",
    pushUrl: "git@github.com:owner/repo.git",
    title: "Improve UI",
    existing: null,
  }
  const api = {
    ...sampleApi(),
    pullRequestInspection: async () => inspection,
    publishPullRequest: async (id, input) => {
      calls.push({ id, input })
      return { number: 4, url: "https://github.com/owner/repo/pull/4" }
    },
  }
  const user = userEvent.setup({ document })
  render(createElement(WorktreeMergeActions, { api, worktreeId: "w1" }))
  await user.click(screen.getByRole("button", { name: "PR", exact: true }))
  const title = await screen.findByLabelText("PR title")
  assert.equal(title.value, "Improve UI")
  assert.equal(calls.length, 0, "PR 창을 여는 것만으로는 원격에 발행하지 않는다")
  await user.type(screen.getByLabelText("PR description"), "Reviewed changes")
  await user.click(screen.getByRole("button", { name: "Publish PR", exact: true }))
  await screen.findByDisplayValue("https://github.com/owner/repo/pull/4")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].input.body, "Reviewed changes")
  assert.equal(calls[0].input.head, inspection.head)
  assert.equal(calls[0].input.existing, undefined)
})

test("PR 준비 실패는 안내하고 발행 버튼을 제공하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeMergeActions } = await server.ssrLoadModule("/src/components/worktree-merge.tsx")
  const { sampleApi } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const user = userEvent.setup({ document })
  render(
    createElement(WorktreeMergeActions, {
      api: {
        ...sampleApi(),
        pullRequestInspection: async () => {
          throw new Error("Commit all changes before publishing a PR")
        },
      },
      worktreeId: "w1",
    }),
  )
  await user.click(screen.getByRole("button", { name: "PR", exact: true }))
  assert.ok(await screen.findByText("Commit all changes before publishing a PR"))
  assert.equal(screen.queryByRole("button", { name: "Publish PR", exact: true }), null)
})

test("전역 설정에서 gh 경로를 저장하고 명시적으로 연결 계정을 확인한다", async () => {
  await i18n.changeLanguage("en")
  const { GlobalSettings } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  let source = JSON.stringify({ server: { port: 54321 }, projects: ["/work"], approval: "auto" })
  let checked = 0
  const snapshot = () => ({ file: "/instance/settings.json", source, revision: source, issues: [] })
  const api = {
    ...sampleApi(),
    instanceSettings: async () => snapshot(),
    saveInstanceSettings: async (input) => {
      source = input.source
      return snapshot()
    },
    githubConnection: async () => {
      checked += 1
      return { login: "owner", cliPath: "/custom/gh" }
    },
  }
  const user = userEvent.setup({ document })
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    render(createElement(GlobalSettings, { api }))
    const path = await screen.findByLabelText("GitHub CLI path")
    assert.equal(checked, 0, "설정을 여는 것만으로는 GitHub에 연결하지 않는다")
    await user.type(path, "/custom/gh")
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await screen.findByText("Settings saved.")
    assert.deepEqual(JSON.parse(source), {
      server: { port: 54321 },
      projects: ["/work"],
      approval: "auto",
      github: { cliPath: "/custom/gh" },
    })
    await user.click(screen.getByRole("button", { name: "Check GitHub connection" }))
    assert.ok(await screen.findByText("Connected as owner"))
    assert.equal(checked, 1)
  } finally {
    globalThis.FormData = previous
  }
})

test("빈 테스트 목록은 탐색 칸 없이 표시하고 파일이 생기면 탐색을 복원한다", async () => {
  const { TestFileBrowser } = await server.ssrLoadModule("/src/components/test-file-browser.tsx")
  const props = { files: [], path: "", label: "Changed tests", onSelect() {} }
  const view = render(createElement(TestFileBrowser, props, "Empty test content"))
  assert.ok(
    screen.queryByRole("tree", { name: "Changed tests" }) === null,
    "빈 목록에 파일 트리가 없어야 한다",
  )
  assert.ok(screen.queryByRole("combobox") === null)
  assert.ok(screen.getByText("Empty test content"))
  view.rerender(
    createElement(
      TestFileBrowser,
      {
        ...props,
        files: [{ path: "one.test.ts" }],
        path: "one.test.ts",
      },
      "Test source",
    ),
  )
  assert.ok(screen.getByRole("tree", { name: "Changed tests" }))
  assert.ok(screen.getByRole("treeitem", { name: /one.test.ts/ }))
})

test("설정과 기록이 없는 단위 테스트는 하나의 설정 안내만 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  const view = render(
    createElement(UnitTests, {
      worktreeId: "empty",
      api: {
        unitTests: async () => ({
          settings: null,
          catalog: { files: [], diagnostics: [] },
          runs: [],
        }),
      },
    }),
  )
  await screen.findByText(
    "Configure a unit test Dockerfile, command and file patterns in Project settings.",
  )
  assert.equal(view.container.querySelectorAll('[data-slot="empty"]').length, 1)
  assert.ok(screen.queryByRole("tab", { name: "Code" }) === null)
})

test("초기 설정 입력 카드는 필요한 키만 직접 전달하고 저장 후 입력을 비운다", async () => {
  await i18n.changeLanguage("en")
  const { CredentialCard } = await server.ssrLoadModule("/src/components/mcp/credential-card.tsx")
  const writes = []
  render(
    createElement(CredentialCard, {
      inputs: [{ name: "CLOUD_KEY", configured: false }],
      save: async (name, value) => {
        writes.push({ name, value })
        return { configured: true }
      },
    }),
  )
  const user = userEvent.setup({ document })
  const input = screen.getByLabelText("CLOUD_KEY")
  await user.type(input, "user-entered-value")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("Configured")
  assert.equal(input.value, "")
  assert.deepEqual(writes, [{ name: "CLOUD_KEY", value: "user-entered-value" }])
})

test("환경변수 저장 충돌은 초안을 유지하고 중복 key는 덮어쓰지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { EnvironmentEditor } = await server.ssrLoadModule("/src/components/environment-editor.tsx")
  const source = {
    dependencies: { api: { modes: { mock: { env: { app: { MODE: "mock", URL: "original" } } } } } },
  }
  let attempts = 0
  const api = {
    projectConfiguration: async () => ({
      source: JSON.stringify(source),
      revision: "r1",
      issues: [],
    }),
    saveProjectConfiguration: async () => {
      attempts++
      throw new Error("Settings changed; reload before saving")
    },
  }
  render(
    createElement(EnvironmentEditor, {
      api,
      projectId: "project",
      dependency: "api",
      modeName: "mock",
      mode: source.dependencies.api.modes.mock,
      refresh() {},
    }),
  )
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Add environment variable" }))
  await user.type(await screen.findByRole("textbox", { name: "key" }), "MODE")
  await user.type(screen.getByRole("textbox", { name: "value" }), "changed")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("This key already exists.")
  assert.equal(attempts, 0)
  await user.clear(screen.getByRole("textbox", { name: "key" }))
  await user.type(screen.getByRole("textbox", { name: "key" }), "NEW_VALUE")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("Settings changed; reload before saving")
  assert.equal(screen.getByRole("textbox", { name: "value" }).value, "changed")
  assert.equal(attempts, 1)
})

test("프로젝트 Playwright 와이어프레임은 캡처에서 실행과 소스로 이동하고 목록으로 돌아온다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const scenario = {
    id: "c",
    title: "캡처 절차",
    file: "panel.ts",
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: "png", name: "설정 패널", contentType: "image/png" }],
  }
  const run = {
    id: "run-one",
    target: "screens",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    createdAt: "2026-09-11",
    projectRoot: "/repo",
    settings: { viewport: { width: 1280, height: 840 } },
    after: { cases: [scenario] },
  }
  let reads = 0
  const api = {
    projectPlaywright: async () => ({
      runs: [run, { ...run, id: "older", createdAt: "2026-09-10" }],
    }),
    projectPlaywrightCatalog: async () => ({
      root: "/repo",
      files: [{ path: "checks.ts", target: "checks", purpose: "functional" }],
    }),
    captureArtifact: (id) => `/saved-${id}.png`,
    captureSource: async () => "recorded capture source",
    projectPlaywrightSource: async () => {
      reads++
      return "current functional source"
    },
  }
  render(createElement(ProjectPlaywright, { api, projectId: "p" }))
  const user = userEvent.setup({ document })
  await screen.findByAltText("설정 패널")
  assert.ok(screen.getByText(/Captured:/))
  assert.equal(screen.queryByRole("radiogroup"), null)
  await user.click(screen.getByRole("tab", { name: "Test Code" }))
  assert.ok(await screen.findByText("recorded capture source"))
  await user.click(
    within(screen.getByRole("tablist", { name: "Captures", exact: true })).getByRole("tab", {
      name: "Screenshots",
    }),
  )
  await user.click(screen.getByRole("button", { name: "screens · 2026-09-11", exact: true }))
  assert.ok(screen.getByRole("tree"))
  assert.ok(await screen.findByAltText("설정 패널"))
  await user.click(screen.getByRole("tab", { name: "Tests", exact: true }))
  assert.ok(await screen.findByText("current functional source"))
  assert.equal(reads, 1)
  assert.ok(screen.getByRole("tree", { name: "Tests" }))
  assert.equal(screen.queryByRole("button", { name: "Back to tests" }), null)
  await user.click(screen.getByRole("tab", { name: "Runs", exact: true }))
  assert.equal(screen.queryByRole("button", { name: "Back to runs" }), null)
  assert.equal(screen.queryByRole("radiogroup"), null)
  await user.click(screen.getByRole("combobox", { name: "Capture run" }))
  await user.click(screen.getByRole("option", { name: /screens · 2026-09-10/ }))
  assert.equal((await screen.findByAltText("설정 패널")).getAttribute("src"), "/saved-older.png")
})

test("프로젝트 Playwright 파일 트리에서 코드와 실행 결과를 전환해도 파일 목록을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const reads = []
  render(
    createElement(ProjectPlaywright, {
      projectId: "p",
      api: {
        projectPlaywright: async () => ({ runs: [] }),
        projectPlaywrightCatalog: async () => ({
          root: "/repo",
          files: [
            { path: "first.spec.ts", target: "checks", purpose: "functional" },
            { path: "second.spec.ts", target: "checks", purpose: "functional" },
          ],
        }),
        projectPlaywrightSource: async (_id, path) => {
          reads.push(path)
          return `// ${path} content`
        },
      },
    }),
  )
  const user = userEvent.setup({ document })
  await user.click(await screen.findByRole("tab", { name: "Tests", exact: true }))
  assert.ok(await screen.findByRole("tree", { name: "Tests" }))
  assert.ok(await screen.findByText(sourceLine("// first.spec.ts content")))
  await user.click(screen.getByRole("tab", { name: "Execution results" }))
  assert.ok(await screen.findByText("No recorded execution for this file."))
  assert.ok(screen.getByRole("tree", { name: "Tests" }))
  await user.click(screen.getByRole("treeitem", { name: "second.spec.ts", exact: true }))
  assert.ok(await screen.findByText(sourceLine("// second.spec.ts content")))
  assert.equal(
    screen.getByRole("tab", { name: "Code", exact: true }).getAttribute("aria-selected"),
    "true",
  )
  assert.ok(screen.getByRole("tree", { name: "Tests" }))
  assert.equal(screen.queryByRole("button", { name: "Back to tests" }), null)
  assert.deepEqual(reads, ["first.spec.ts", "second.spec.ts"])
})

test("프로젝트 Playwright 헤더에서 대상을 고른 뒤에만 테스트를 실행한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const calls = []
  let finishRun
  const run = {
    id: "new-run",
    settings: { viewport: { width: 1280, height: 840 } },
    target: "functional",
    purpose: "functional",
    state: "queued",
    before: { cases: [] },
    after: { cases: [] },
    createdAt: new Date().toISOString(),
  }
  const api = {
    projectPlaywright: async () => ({ runs: [] }),
    projectPlaywrightCatalog: async () => ({ root: "/repo", settings: null, files: [] }),
    worktrees: async () => [{ id: "w", branch: "local", checkoutRoot: "/repo" }],
    playwright: async () => ({
      settings: { targets: { functional: { purpose: "functional" } } },
      runs: [],
    }),
    runPlaywright: async (...args) => {
      calls.push(args)
      return new Promise((resolve) => {
        finishRun = () => resolve(run)
      })
    },
  }
  render(createElement(ProjectPlaywright, { api, projectId: "p" }))
  const user = userEvent.setup()
  const action = screen.getByRole("button", { name: "Run Playwright" })
  assert.ok(screen.getByRole("tablist", { name: "Playwright" }))
  await user.click(action)
  await screen.findByRole("combobox", { name: "Worktree" })
  await waitFor(() =>
    assert.equal(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Run Playwright" }).disabled,
      false,
    ),
  )
  assert.equal(calls.length, 0)
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Run Playwright" }),
  )
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], ["w", undefined, undefined, "functional"])
  assert.ok(screen.getByRole("dialog"))
  // Exercise a failed poll before completion without inspecting the DOM's React fiber graph.
  const closed = waitFor(() =>
    assert.ok(screen.queryByRole("dialog") === null, "Dialog should close"),
  )
  finishRun()
  await closed
  assert.equal(screen.getByRole("tab", { name: "Runs" }).getAttribute("aria-selected"), "true")
  const toolbar = screen
    .getByRole("button", { name: "Run Playwright" })
    .closest('[data-slot="review-toolbar"]')
  assert.ok(toolbar.querySelector('[role="tablist"]'))
  assert.ok(toolbar.querySelector('[data-slot="tab-indicator"]').classList.contains("rounded-full"))
})

test("Playwright 실행은 설정 오류와 활성 실행을 차단하고 요청 실패 후 재시도를 허용한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywrightAction } = await server.ssrLoadModule(
    "/src/components/project-playwright-action.tsx",
  )
  const user = userEvent.setup()
  for (const data of [
    { settings: null, runs: [] },
    {
      settings: { targets: { app: { purpose: "functional" } } },
      runs: [],
      error: "Invalid settings",
    },
    { settings: { targets: { app: { purpose: "functional" } } }, runs: [{ state: "running" }] },
    {
      settings: { targets: { app: { purpose: "functional" } } },
      runs: [{ state: "finished", cleanupError: "Cleanup failed" }],
    },
  ]) {
    let reads = 0
    render(
      createElement(ProjectPlaywrightAction, {
        projectId: "p",
        onRun() {},
        api: {
          worktrees: async () => [{ id: "w", checkoutRoot: "/repo" }],
          playwright: async () => {
            reads++
            return data
          },
          runPlaywright: async () => assert.fail("Blocked execution must not reach the API"),
        },
      }),
    )
    await user.click(screen.getByRole("button", { name: "Run Playwright" }))
    await waitFor(() => assert.equal(reads, 1))
    assert.equal(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Run Playwright" }).disabled,
      true,
    )
    cleanup()
  }
  let calls = 0
  let rejectRun
  render(
    createElement(ProjectPlaywrightAction, {
      projectId: "p",
      onRun() {},
      api: {
        worktrees: async () => [{ id: "w", checkoutRoot: "/repo" }],
        playwright: async () => ({
          settings: { targets: { app: { purpose: "functional" } } },
          runs: [],
        }),
        runPlaywright: async () => {
          calls++
          return new Promise((_, reject) => {
            rejectRun = reject
          })
        },
      },
    }),
  )
  await user.click(screen.getByRole("button", { name: "Run Playwright" }))
  const execute = await within(await screen.findByRole("dialog")).findByRole("button", {
    name: "Run Playwright",
  })
  await waitFor(() => assert.equal(execute.disabled, false))
  await user.dblClick(execute)
  assert.equal(calls, 1)
  assert.equal(execute.disabled, true)
  await user.keyboard("{Escape}")
  assert.ok(screen.getByRole("dialog"))
  rejectRun(new Error("Saved selection is required"))
  await screen.findByText("Error: Saved selection is required")
  assert.equal(execute.disabled, false)
})

test("스크린샷은 페이지와 의미 그룹으로 나누고 같은 이름도 올바른 이미지로 탐색한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const names = [
    "Settings / Appearance / Default",
    "Checkout / Default",
    "Settings / Appearance / Dark",
    "Standalone",
    "GET /api/health",
  ]
  const run = {
    id: "grouped",
    target: "captures",
    purpose: "capture",
    state: "finished",
    createdAt: "2026-09-11",
    projectRoot: "/repo",
    settings: { viewport: { width: 1280, height: 840 } },
    after: {
      cases: [
        {
          id: "case",
          file: "capture.ts",
          title: "페이지 캡처",
          status: "passed",
          errors: [],
          steps: [],
          artifacts: names.map((name, index) => ({
            id: String(index),
            name,
            contentType: "image/png",
          })),
        },
      ],
    },
  }
  const api = {
    projectPlaywright: async () => ({ runs: [run] }),
    projectPlaywrightCatalog: async () => ({ files: [] }),
    captureArtifact: (_run, _side, id) => `/image-${id}.png`,
  }
  render(createElement(ProjectPlaywright, { api, projectId: "p" }))
  const user = userEvent.setup({ document })
  await screen.findByAltText(names[0])
  assert.ok(screen.getByRole("tree"))
  await user.click(screen.getByRole("combobox", { name: "Checkpoint" }))
  for (const name of names) {
    assert.ok(screen.getByRole("option", { name: `${name} · captures · 페이지 캡처`, exact: true }))
  }
  await user.click(
    screen.getByRole("option", {
      name: "Settings / Appearance / Dark · captures · 페이지 캡처",
      exact: true,
    }),
  )
  assert.equal(screen.getByRole("img").getAttribute("src"), "/image-2.png")
  await user.click(screen.getByRole("combobox", { name: "Checkpoint" }))
  await user.click(
    screen.getByRole("option", {
      name: "Checkout / Default · captures · 페이지 캡처",
      exact: true,
    }),
  )
  assert.equal(screen.getByRole("img").getAttribute("src"), "/image-1.png")
  assert.equal(screen.getByRole("img").getAttribute("alt"), "Checkout / Default")
})

test("테스트 환경은 JSON 대신 변수별 입력으로 수정하고 참조와 무관한 설정을 보존한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const source = {
    tests: {
      env: {
        URL: { service: "app", port: 3000, scheme: "http" },
        TOKEN: { secret: "KEY" },
        TEXT: "hello\nworld",
      },
    },
    dependencies: {},
  }
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: JSON.stringify(source),
    revision: "r1",
    issues: [],
  }
  const saves = []
  const api = {
    projectConfiguration: async () => snapshot,
    saveProjectConfiguration: async (_, input) => {
      saves.push(input)
      return { ...snapshot, ...input, revision: "r2" }
    },
  }
  render(createElement(AuthoredSettings, { api, projectId: "p1" }))
  const input = await screen.findByRole("textbox", { name: "Value 3" })
  assert.equal(input.value, "hello\nworld")
  assert.equal(screen.queryByRole("textbox", { name: "Test environment (JSON)" }), null)
  assert.equal(screen.getByRole("combobox", { name: "Value type 1" }).value, "Service endpoint")
  const user = userEvent.setup({ document })
  await user.clear(input)
  await user.type(input, "updated")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), {
      ...source,
      tests: { env: { ...source.tests.env, TEXT: "updated" } },
    })
    assert.equal(saves[0].revision, "r1")
  } finally {
    globalThis.FormData = previous
  }
})

test("환경변수 입력은 중복 이름 저장을 막고 잘못된 JSON 초안을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  let saves = 0
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: '{"tests":{"env":{"A":"one","B":"two"}}}',
    revision: "r1",
    issues: [],
  }
  const api = {
    projectConfiguration: async () => snapshot,
    saveProjectConfiguration: async () => {
      saves++
      return snapshot
    },
  }
  render(createElement(AuthoredSettings, { api, projectId: "p1" }))
  const user = userEvent.setup({ document })
  const second = await screen.findByRole("textbox", { name: "Variable 2", exact: true })
  await user.clear(second)
  await user.type(second, "A")
  assert.equal(second.validity.valid, false)
  await user.click(screen.getByRole("button", { name: "Save settings" }))
  assert.equal(saves, 0)
  assert.equal(screen.getByRole("button", { name: "Edit JSON" }).disabled, true)
  await user.clear(second)
  await user.type(second, "B")
  await user.click(screen.getByRole("button", { name: "Edit JSON" }))
  const json = screen.getByRole("textbox", { name: "Test environment (JSON)" })
  await user.clear(json)
  await user.type(json, "[[]")
  await user.click(screen.getByRole("button", { name: "Use fields" }))
  assert.equal(json.value, "[]")
  assert.ok(screen.getByRole("alert"))
  await user.clear(json)
  await user.paste('{"ENDPOINT":{"service":"web","port":443,"scheme":"https"},"EMPTY":""}')
  await user.click(screen.getByRole("button", { name: "Use fields" }))
  assert.equal(screen.getByRole("spinbutton", { name: "Port 1" }).value, "443")
  assert.equal(screen.getByRole("textbox", { name: "Value 2" }).value, "")
  await user.click(screen.getByRole("button", { name: "Remove variable 1" }))
  await user.click(screen.getByRole("button", { name: "Add environment variable" }))
  const added = screen.getByRole("textbox", { name: "Variable 2", exact: true })
  await user.type(added, "TOKEN")
  await user.click(screen.getByRole("combobox", { name: "Value type 2" }))
  await user.click(await screen.findByRole("option", { name: "Secret reference" }))
  await user.type(screen.getByRole("textbox", { name: "Secret name 2" }), "API_KEY")
  const serialized = JSON.parse(
    added.closest("form").querySelector('input[name="tests.env"]').value,
  )
  assert.deepEqual(serialized, { EMPTY: "", TOKEN: { secret: "API_KEY" } })
})

test("의존성 Overview가 앱 관계와 미구현 권장을 설정 및 실행 증거와 구분한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const user = userEvent.setup({ document })
  const settings = {
    valid: true,
    issues: [],
    file: "settings.json",
    applicationServices: { web: { services: ["next", "assets"] }, worker: { services: ["jobs"] } },
    dependencies: {
      portone: {
        modes: { remote: {} },
        assessments: {
          isolated: {
            status: "unavailable",
            reason: "Hosted payment service",
            evidence: [{ path: "lib/payment.ts", line: 12 }],
          },
          mock: {
            status: "implementation-needed",
            reason: "Implement payment adapter",
            evidence: [{ path: "lib/payment.ts", line: 12 }],
          },
        },
        recommendation: { mode: "mock", reason: "Local payment verification" },
      },
    },
    relationships: [
      {
        from: "web",
        to: { kind: "application", name: "worker" },
        description: "Enqueue work",
        evidence: [{ path: "app/jobs.ts", line: 3 }],
      },
      {
        from: "worker",
        to: { kind: "dependency", name: "portone" },
        description: "Verify payment",
        evidence: [{ path: "lib/payment.ts", line: 12 }],
      },
    ],
  }
  const api = { projectDependencies: async () => settings }
  const view = render(createElement(ProjectDependencies, { api, projectId: "p" }))
  assert.ok(await screen.findByRole("tab", { name: "Overview", selected: true }))
  const graph = await screen.findByRole("region", { name: "Service relationships" })
  await waitFor(() => {
    assert.ok(graph.querySelector('svg[aria-roledescription="flowchart-v2"]'))
    assert.equal(graph.querySelectorAll(".edgePaths path").length, 2)
  })
  assert.equal(graph.querySelectorAll(".cluster").length, 2)
  assert.ok(graph.textContent.includes("Application services"))
  await user.click(screen.getByRole("button", { name: "Dependency: portone", exact: true }))
  const details = screen.getByRole("region", { name: "Service details" })
  assert.ok(details.textContent.includes("Implementation needed"))
  assert.ok(details.textContent.includes("Unavailable"))
  assert.ok(details.textContent.includes("Configured"))
  assert.ok(details.textContent.includes("Local payment verification"))
  assert.ok(details.textContent.includes("lib/payment.ts:12"))
  assert.ok(details.textContent.includes("worker"))
  assert.equal(details.textContent.includes("Running"), false)
  view.rerender(
    createElement(ProjectDependencies, {
      api: {
        projectDependencies: async () => ({
          ...settings,
          dependencies: {
            ...settings.dependencies,
            cache: {
              modes: {},
              assessments: {
                mock: {
                  status: "implementation-needed",
                  reason: "Add cache adapter",
                  evidence: [{ path: "lib/cache.ts", line: 1 }],
                },
              },
            },
          },
        }),
      },
      projectId: "p",
    }),
  )
  await screen.findByRole("button", { name: "Dependency: cache", exact: true })
  await waitFor(() => assert.equal(graph.querySelectorAll('svg g[role="button"]').length, 4))
  assert.equal(
    screen
      .getByRole("button", { name: "Dependency: portone", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  )
  await user.click(screen.getByRole("button", { name: "Application service: web", exact: true }))
  await user.click(screen.getByRole("button", { name: "Compose services" }))
  assert.ok(screen.getByText("assets"))
  await user.click(screen.getByRole("tab", { name: "Configuration" }))
  assert.ok(screen.getByRole("button", { name: "Select dependency" }))
})

test("Overview는 현재 의존성만 표시하고 워크트리 실행 이력을 조회하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectDependencies } = await server.ssrLoadModule(
    "/src/components/dependency-viewer.tsx",
  )
  const calls = []
  const api = {
    projectDependencies: async () => ({
      valid: true,
      issues: [],
      dependencies: { payment: { modes: { mock: {}, remote: {} } } },
    }),
    worktreeSelection: async (id) => {
      calls.push(id)
      return { selection: { services: ["app"], select: { payment: "mock" } } }
    },
    environments: async (id) => [
      {
        id: "old-env",
        target: { worktreeId: id },
        state: "stopped",
        lifecycle: "run",
        createdAt: "2026-09-11T00:00:00Z",
        selection: { services: ["app"], select: { payment: "remote" } },
        services: [],
        endpoints: {},
      },
    ],
  }
  render(
    createElement(ProjectDependencies, {
      api,
      projectId: "p",
      worktree: { id: "w", checkoutRoot: "/repo/feature" },
    }),
  )
  await screen.findByRole("button", { name: "Dependency: payment", exact: true })
  assert.equal(screen.queryByRole("region", { name: "Worktree execution evidence" }) === null, true)
  assert.equal(screen.queryByText("old-env"), null)
  assert.deepEqual(calls, [])
})

test("프로젝트 설정은 오류가 있어도 항목별 그룹을 유지하고 dependency 원문을 노출하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const initial = {
    composeFiles: ["compose.yaml"],
    dependencies: {
      payments: { modes: { remote: { env: { app: { TOKEN: "private-config" } } } } },
    },
    tests: { timeoutMs: 70000 },
  }
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: JSON.stringify(initial),
    revision: "r1",
    issues: ["tests.timeoutMs: Too big: expected number to be <=60000"],
  }
  const saves = []
  render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: {
        projectConfiguration: async () => snapshot,
        saveProjectConfiguration: async (_, input) => {
          saves.push(input)
          return { ...snapshot, ...input, issues: [], revision: "r2" }
        },
      },
    }),
  )
  await screen.findByText(snapshot.issues[0])
  assert.ok(
    screen.queryByRole("spinbutton", { name: "Test and hook timeout (ms)" }),
    "Validation must keep the field editor available",
  )
  for (const name of ["Application", "Unit Test", "Integration Test", "Playwright"]) {
    assert.ok(screen.getByRole("heading", { name, exact: true }))
  }
  assert.equal(screen.queryByRole("textbox", { name: "Settings JSON" }), null)
  assert.equal(document.body.textContent.includes("private-config"), false)
  const user = userEvent.setup({ document })
  const input = screen.getByRole("spinbutton", { name: "Test and hook timeout (ms)" })
  await user.clear(input)
  await user.type(input, "20000")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), { ...initial, tests: { timeoutMs: 20000 } })
  } finally {
    globalThis.FormData = previous
  }
})

test("프로젝트 설정에서 Compose 목록과 Playwright 대상을 폼으로 추가한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const initial = {
    composeFiles: ["compose.yaml"],
    playwright: {
      service: "app",
      port: 3000,
      targets: { review: { purpose: "capture", testMatch: ["capture/*.ts"] } },
    },
    dependencies: {},
  }
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: JSON.stringify(initial),
    revision: "r1",
    issues: [],
  }
  const saves = []
  render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: {
        projectConfiguration: async () => snapshot,
        saveProjectConfiguration: async (_, input) => {
          saves.push(input)
          return { ...snapshot, ...input, revision: "r2" }
        },
      },
    }),
  )
  await screen.findByRole("textbox", { name: "Compose files" })
  assert.ok(
    screen.queryByRole("button", { name: "Add Compose files" }),
    "Lists need explicit item controls",
  )
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Add Compose files" }))
  await user.type(screen.getByRole("textbox", { name: "Compose files 2" }), "compose.test.yaml")
  await user.click(screen.getByRole("button", { name: "Add Playwright target" }))
  await user.type(screen.getByRole("textbox", { name: "Target name 2" }), "functional")
  await user.click(screen.getByRole("combobox", { name: "Target purpose 2" }))
  await user.click(await screen.findByRole("option", { name: "Functional execution" }))
  await user.type(screen.getByRole("textbox", { name: "Target files 2" }), "worktree/tests/*.ts")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), {
      ...initial,
      composeFiles: ["compose.yaml", "compose.test.yaml"],
      playwright: {
        ...initial.playwright,
        targets: {
          ...initial.playwright.targets,
          functional: {
            scope: "worktree",
            purpose: "functional",
            testMatch: ["worktree/tests/*.ts"],
          },
        },
      },
    })
  } finally {
    globalThis.FormData = previous
  }
})

test("해석할 수 없는 프로젝트 설정은 원문 편집 대신 파일 복구 안내를 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: {
        projectConfiguration: async () => ({
          file: "/project/.redpact/settings.json",
          source: '{"dependencies":',
          revision: "r1",
          issues: ["Invalid JSON"],
        }),
      },
    }),
  )
  await screen.findByText("Invalid JSON")
  assert.equal(
    screen.queryByRole("textbox", { name: "Settings JSON" }),
    null,
    "Project settings must not expose the whole dependency document",
  )
  assert.ok(screen.getByText("Ask your agent to repair this file, then reload settings."))
})

test("서버 검증 오류를 항목 옆에 표시하고 중복 키 파일은 자동 변환하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: '{"tests":{"timeoutMs":70000}}',
    revision: "r1",
    issues: [JSON.stringify([{ path: ["tests", "timeoutMs"], message: "Timeout is too large" }])],
  }
  const view = render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: { projectConfiguration: async () => snapshot },
    }),
  )
  const field = await screen.findByRole("spinbutton", { name: "Test and hook timeout (ms)" })
  assert.ok(
    within(field.closest('[data-slot="settings-row"]')).getByText(
      "tests.timeoutMs: Timeout is too large",
    ),
  )
  assert.equal(field.getAttribute("aria-invalid"), "true")
  view.unmount()
  render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: {
        projectConfiguration: async () => ({
          ...snapshot,
          source: '{"tests":{},"tests":{}}',
          issues: ["Invalid JSON or duplicate keys"],
        }),
      },
    }),
  )
  await screen.findByText("Invalid JSON or duplicate keys")
  assert.equal(screen.queryByRole("button", { name: "Save settings" }), null)
  assert.equal(screen.queryByRole("textbox", { name: "Settings JSON" }), null)
})

test("Playwright 화면 크기와 영상 옵션을 변경해도 기존 대상과 생략값을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const initial = {
    playwright: {
      service: "app",
      port: 3000,
      targets: { review: { purpose: "capture", testMatch: ["capture/*.ts"] } },
    },
  }
  const snapshot = {
    file: "/project/.redpact/settings.json",
    source: JSON.stringify(initial),
    revision: "r1",
    issues: [],
  }
  const saves = []
  render(
    createElement(AuthoredSettings, {
      projectId: "p",
      api: {
        projectConfiguration: async () => snapshot,
        saveProjectConfiguration: async (_, input) => {
          saves.push(input)
          return { ...snapshot, ...input, revision: "r2" }
        },
      },
    }),
  )
  const width = await screen.findByRole("spinbutton", { name: "Viewport width" })
  const user = userEvent.setup({ document })
  await user.type(width, "1440")
  await user.click(screen.getByRole("button", { name: "Record video" }))
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Record video" }))
  await user.keyboard("{Escape}")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 1))
    assert.deepEqual(JSON.parse(saves[0].source), {
      playwright: { ...initial.playwright, viewport: { width: 1440, height: 1080 }, video: true },
    })
  } finally {
    globalThis.FormData = previous
  }
})

test("project Tests navigation browses and executes only the primary checkout", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeSidebar } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { SidebarProvider } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
  let opened = false
  const sidebar = render(
    createElement(
      SidebarProvider,
      null,
      createElement(WorktreeSidebar, {
        projectMenu: "Project",
        worktrees: [],
        selectedId: "",
        pending: false,
        loading: false,
        onSelect() {},
        onDependencies() {},
        onTests() {
          opened = true
        },
        testsActive: true,
      }),
    ),
  )
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("button", { name: "Tests" }))
  assert.equal(opened, true)
  sidebar.unmount()
  const { ProjectTests } = await server.ssrLoadModule("/src/components/project-tests.tsx")
  const calls = []
  const runs = []
  const settings = {
    command: "pnpm test",
    cwd: ".",
    dockerfile: "Dockerfile",
    patterns: ["**/*.test.ts"],
  }
  const api = {
    unitTests: async (id, _signal, scope) => {
      calls.push([id, scope])
      return {
        settings,
        catalog: { files: [{ path: `${id}.test.ts`, source: `${id} source` }], diagnostics: [] },
        runs: [],
      }
    },
    runUnitTests: async (id) => {
      runs.push(id)
      return {
        id: "run",
        worktreeId: id,
        projectRoot: `/repo/${id}`,
        state: "running",
        settings,
        createdAt: "2026-09-11T00:00:00Z",
        cleanup: { state: "pending" },
        stdout: "",
        stderr: "",
        exitCode: null,
      }
    },
    integrationTests: async (id, _signal, scope) => {
      calls.push([id, scope])
      return {
        directory: "tests",
        catalog: {
          files: [{ path: "tests/saved.test.ts", source: "integration source" }],
          diagnostics: [],
        },
      }
    },
    submissions: async () => ({ items: [], nextCursor: null }),
    runIntegrationTests: async (id) => {
      runs.push(`integration:${id}`)
      return {
        id: "integration-run",
        submissionId: "fresh",
        state: "queued",
        createdAt: "2026-09-11T00:00:00Z",
        result: null,
      }
    },
    submission: async () => ({
      id: "fresh",
      files: [{ path: "saved.test.ts", source: "fresh captured source" }],
      parsed: [],
    }),
  }
  render(
    createElement(ProjectTests, {
      api,
      projectId: "project",
      primaryRoot: "/repo/main",
      worktrees: [
        { id: "main", projectId: "project", branch: "main", checkoutRoot: "/repo/main" },
        { id: "feature", projectId: "project", branch: "feature", checkoutRoot: "/repo/feature" },
      ],
    }),
  )
  await screen.findByText("main source")
  assert.ok(screen.queryByText(/^[0-9]+ files?$/) === null)
  assert.ok(screen.queryByText("+0") === null)
  assert.ok(screen.queryByText("−0") === null)
  assert.equal(screen.queryByText("/repo/main"), null)
  assert.equal(screen.queryByText("pnpm test"), null)
  assert.equal(screen.queryByText(/Runs the configured command in full/), null)
  assert.deepEqual(calls, [["main", "all"]])
  assert.deepEqual(runs, [])
  const toolbar = screen
    .getByRole("tab", { name: "Unit", exact: true })
    .closest('[data-slot="review-toolbar"]')
  assert.ok(within(toolbar).getByRole("button", { name: "Run Unit command" }))
  assert.equal(screen.queryByRole("combobox", { name: "Worktree" }), null)
  await user.click(within(toolbar).getByRole("button", { name: "Run Unit command" }))
  assert.deepEqual(runs, ["main"])
  await user.click(screen.getByRole("tab", { name: "Integration", exact: true }))
  await screen.findByText("integration source")
  assert.ok(screen.queryByText(/^[0-9]+ files?$/) === null)
  assert.ok(screen.queryByText("+0") === null)
  assert.ok(screen.queryByText("−0") === null)
  assert.equal(screen.queryByText("/repo/feature"), null)
  assert.deepEqual(calls.at(-1), ["main", "all"])
  assert.ok(screen.getByRole("tree", { name: "Integration test files" }))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, false),
  )
  await user.click(screen.getByRole("button", { name: "Run Integration tests" }))
  assert.deepEqual(runs, ["main", "integration:main"])
  await screen.findByText("Run status: queued")
  assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, true)
})

test("integration execution follows refreshed runs after its own run finishes", async () => {
  await i18n.changeLanguage("en")
  const { TestObservation } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const api = {
    integrationTests: async () => ({ directory: "tests", catalog: { files: [], diagnostics: [] } }),
    submissions: async () => ({ items: [{ id: "submission" }] }),
    submission: async () => ({ id: "submission", files: [], parsed: [] }),
    runs: async () => ({ items: [] }),
    startRun: async () => ({ id: "own", state: "queued", result: null }),
  }
  const view = render(createElement(TestObservation, { api, worktreeId: "w" }))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, false),
  )
  await userEvent
    .setup({ document })
    .click(screen.getByRole("button", { name: "Run Integration tests" }))
  await screen.findByText("Run status: queued")
  const finished = {
    ...api,
    runs: async () => ({ items: [{ id: "own" }] }),
    run: async () => ({ id: "own", state: "finished", result: null }),
  }
  view.rerender(createElement(TestObservation, { api: finished, worktreeId: "w" }))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, false),
  )
  const next = {
    ...finished,
    runs: async () => ({ items: [{ id: "other" }] }),
    run: async () => ({ id: "other", state: "running", result: null }),
  }
  view.rerender(createElement(TestObservation, { api: next, worktreeId: "w" }))
  await screen.findByText("Run status: running")
  assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, true)
})

test("Mermaid dependency nodes preserve literal names, keyboard focus and refreshed selection", async () => {
  await i18n.changeLanguage("en")
  const { DependencyOverview } = await server.ssrLoadModule(
    "/src/components/dependency-overview.tsx",
  )
  const user = userEvent.setup({ document })
  const name = 'db"] --> injected["bad <img src=x onerror=alert(1)> & # end'
  const settings = {
    applicationServices: { same: { services: ["app"] } },
    dependencies: { same: { modes: {} }, [name]: { modes: {}, description: "Literal dependency" } },
    relationships: [
      { from: "same", to: { kind: "dependency", name }, description: "Uses storage", evidence: [] },
    ],
  }
  const view = render(createElement(DependencyOverview, { settings }))
  const graph = screen.getByRole("region", { name: "Service relationships" })
  await waitFor(() => assert.equal(graph.querySelectorAll('svg g[role="button"]').length, 3))
  assert.equal(graph.querySelectorAll("img, script").length, 0)
  assert.equal(graph.querySelectorAll(".edgePaths path").length, 1)
  const node = screen.getByRole("button", { name: `Dependency: ${name}`, exact: true })
  assert.equal(node.textContent, name)
  assert.equal(graph.querySelectorAll(".dependency-connected").length, 1)
  node.focus()
  await user.keyboard("{Enter}")
  assert.equal(document.activeElement, node)
  assert.equal(node.getAttribute("aria-pressed"), "true")
  assert.ok(
    screen
      .getByRole("region", { name: "Service details" })
      .textContent.includes("Literal dependency"),
  )
  assert.ok(screen.getByRole("button", { name: "Application service: same", exact: true }))
  assert.ok(screen.getByRole("button", { name: "Dependency: same", exact: true }))
  view.rerender(
    createElement(DependencyOverview, {
      settings: {
        applicationServices: settings.applicationServices,
        dependencies: {},
        relationships: [],
      },
    }),
  )
  await waitFor(() => assert.equal(graph.querySelectorAll('svg g[role="button"]').length, 1))
  assert.equal(
    screen
      .getByRole("button", { name: "Application service: same", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  )
})

test("Mermaid failure keeps service details selectable and a new diagram recovers", async () => {
  await i18n.changeLanguage("en")
  const { DependencyDiagram } = await server.ssrLoadModule("/src/components/dependency-diagram.tsx")
  const nodes = [{ kind: "application", name: "web" }]
  const selected = []
  const props = { nodes, active: nodes[0], onSelect: (key) => selected.push(key) }
  const view = render(createElement(DependencyDiagram, { ...props, source: "invalid diagram" }))
  assert.ok(await screen.findByRole("alert"))
  await userEvent
    .setup({ document })
    .click(screen.getByRole("button", { name: "Application service: web" }))
  assert.deepEqual(selected, ["application:web"])
  view.rerender(
    createElement(DependencyDiagram, {
      ...props,
      source: 'flowchart LR\nservice0["web"]:::service0',
    }),
  )
  await waitFor(() => assert.ok(view.container.querySelector('svg g[role="button"]')))
  assert.equal(screen.queryByRole("alert"), null)
})

test("새 캡처가 대체한 미분류 이름과 삭제된 시나리오는 목록에서 제거하고 실행 원본은 보존한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const makeRun = (id, createdAt, names, outcome = "passed", target = "captures") => ({
    id,
    createdAt,
    target,
    outcome,
    purpose: "capture",
    state: "finished",
    projectRoot: "/repo",
    settings: { viewport: { width: 1280, height: 840 } },
    after: {
      cases: [
        {
          id,
          file: "capture.ts",
          title: id,
          status: outcome,
          errors: [],
          steps: [],
          artifacts: names.map((name, index) => ({
            id: `${id}-${index}`,
            name,
            contentType: "image/png",
          })),
        },
      ],
    },
  })
  const old = makeRun("old", "2026-09-10", ["Default", "Removed"])
  const current = makeRun("current", "2026-09-11", ["Settings / Appearance / Default"])
  const failed = makeRun("failed", "2026-09-12", ["Partial"], "failed")
  const other = makeRun("other", "2026-09-09", ["Other target"], "passed", "other")
  render(
    createElement(ProjectPlaywright, {
      projectId: "p",
      api: {
        projectPlaywright: async () => ({ runs: [old, failed, current, other] }),
        projectPlaywrightCatalog: async () => ({ files: [] }),
        captureArtifact: (run, _side, id) => `/${run}/${id}.png`,
      },
    }),
  )
  await screen.findByAltText("Settings / Appearance / Default")
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("combobox", { name: "Checkpoint" }))
  assert.equal(screen.queryByRole("option", { name: /Removed|Partial/ }), null)
  assert.ok(screen.getByRole("option", { name: /Other target/ }))
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("tab", { name: "Runs", exact: true }))
  await user.click(screen.getByRole("combobox", { name: "Capture run" }))
  await user.click(screen.getByRole("option", { name: /captures · 2026-09-10/ }))
  assert.equal(screen.getByAltText("Removed").getAttribute("src"), "/old/old-1.png")
})

test("전역 테스트 자원 한도를 수정하고 다른 설정과 기본값 생략을 보존한다", async () => {
  await i18n.changeLanguage("en")
  const { AuthoredSettings } = await server.ssrLoadModule("/src/components/authored-settings.tsx")
  const snapshot = { source: '{"approval":"ask"}', revision: "r1", issues: [] }
  const saves = []
  const api = {
    instanceSettings: async () => snapshot,
    saveInstanceSettings: async (input) => {
      saves.push(input)
      return { ...snapshot, ...input, revision: "r2" }
    },
  }
  render(createElement(AuthoredSettings, { api }))
  const memory = await screen.findByRole("spinbutton", { name: "Test memory limit (MiB)" })
  assert.equal(memory.placeholder, "2048")
  const timeout = screen.getByRole("spinbutton", { name: "Test run time limit (seconds)" })
  assert.equal(timeout.placeholder, "600")
  const user = userEvent.setup({ document })
  await user.type(memory, "1024")
  await user.type(timeout, "120")
  const previous = globalThis.FormData
  globalThis.FormData = dom.window.FormData
  try {
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 1))
    await user.clear(screen.getByRole("spinbutton", { name: "Test memory limit (MiB)" }))
    await user.clear(screen.getByRole("spinbutton", { name: "Test run time limit (seconds)" }))
    await user.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => assert.equal(saves.length, 2))
    assert.deepEqual(JSON.parse(saves[1].source), { approval: "ask" })
  } finally {
    globalThis.FormData = previous
  }
  assert.deepEqual(JSON.parse(saves[0].source), {
    approval: "ask",
    testResources: { memoryMiB: 1024, timeoutSeconds: 120 },
  })
  assert.equal(saves[0].revision, "r1")
})

test("워크트리 캡처는 기본 FHD 16:9 해상도로 실행한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const calls = []
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({
          settings: { targets: { captures: { purpose: "capture" } } },
          runs: [],
        }),
        worktreePlaywrightCatalog: async () => ({ files: [], diagnostics: [] }),
        runPlaywright: async (...args) => {
          calls.push(args)
          throw new Error("Stopped after recording request")
        },
      },
    }),
  )
  const button = await screen.findByRole("button", { name: "Run Playwright" })
  await waitFor(() => assert.equal(button.disabled, false))
  await userEvent.setup().click(button)
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], ["w", undefined, { width: 1920, height: 1080 }, "captures"])
  await screen.findByText("Stopped after recording request")
})

test("프로젝트 사이드바에서 File Viewer가 Git Graph 위에 열린다", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeSidebar } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { SidebarProvider } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
  let opened = false
  render(
    createElement(
      SidebarProvider,
      {},
      createElement(WorktreeSidebar, {
        projectMenu: "Project",
        worktrees: [],
        selectedId: "",
        pending: false,
        loading: false,
        onSelect() {},
        onDependencies() {},
        onFiles() {
          opened = true
        },
        onGitGraph() {},
      }),
    ),
  )
  const button = screen.getByRole("button", { name: "File Viewer" })
  assert.ok(
    button.compareDocumentPosition(screen.getByRole("button", { name: "Git Graph" })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  )
  await userEvent.setup().click(button)
  assert.equal(opened, true)
})

test("File Viewer에서 Diff 트리를 펼치고 원문과 파일 아이콘을 확인한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectFileViewer } = await server.ssrLoadModule(
    "/src/components/project-file-viewer.tsx",
  )
  const api = {
    projectFile: async (_id, path) => {
      if (path === "src/hello.ts") {
        return { kind: "text", path, content: "<script>original</script>\n" }
      }
      return {
        kind: "directory",
        path,
        entries: path ? [{ name: "hello.ts", kind: "file" }] : [{ name: "src", kind: "directory" }],
      }
    },
  }
  render(createElement(ProjectFileViewer, { api, projectId: "project" }))
  const user = userEvent.setup()
  await user.click(await screen.findByRole("treeitem", { name: "src" }))
  await user.click(await screen.findByRole("treeitem", { name: "hello.ts" }))
  await waitFor(() =>
    assert.equal(document.querySelector(".diff-code")?.textContent, "<script>original</script>"),
  )
  assert.equal(document.querySelector(".diff script"), null)
  assert.ok(screen.queryByText("1 file") === null)
  assert.ok(document.querySelector(".diff-gutter"))
  assert.equal(document.querySelector(".diff-code-insert, .diff-code-delete"), null)
  assert.ok(
    screen
      .getByRole("treeitem", { name: "hello.ts" })
      .querySelector('img[src$="/material-icons/typescript.svg"]'),
  )
  await user.click(screen.getByRole("treeitem", { name: "src" }))
  assert.equal(screen.queryByRole("treeitem", { name: "hello.ts" }), null)
  assert.ok(document.querySelector(".diff-code"))
})

test("File Viewer에서 같은 파일을 다시 눌러도 원문을 유지하고 오류를 재시도한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectFileViewer } = await server.ssrLoadModule(
    "/src/components/project-file-viewer.tsx",
  )
  let failed = true
  const reads = []
  const api = {
    projectFile: async (_id, path) => {
      reads.push(path)
      if (!path) {
        return {
          kind: "directory",
          path,
          entries: [
            { name: "empty", kind: "directory" },
            { name: "readme.md", kind: "file" },
            { name: "image.png", kind: "file" },
          ],
        }
      }
      if (path === "empty") {
        return { kind: "directory", path, entries: [] }
      }
      if (path === "image.png") {
        return { kind: "binary", path }
      }
      if (failed) {
        throw new Error("File temporarily unavailable")
      }
      return { kind: "text", path, content: "original" }
    },
  }
  render(createElement(ProjectFileViewer, { api, projectId: "project" }))
  const user = userEvent.setup()
  const file = await screen.findByRole("treeitem", { name: "readme.md" })
  assert.deepEqual(reads, [""])
  await user.click(file)
  assert.ok(await screen.findByText("File temporarily unavailable"))
  failed = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => assert.equal(document.querySelector(".diff-code")?.textContent, "original"))
  await user.click(file)
  assert.equal(document.querySelector(".diff-code")?.textContent, "original")
  const folder = screen.getByRole("treeitem", { name: "empty" })
  await user.keyboard("{Home}")
  await waitFor(() => assert.ok(document.activeElement === folder))
  await user.keyboard("{ArrowRight}")
  await waitFor(() => assert.ok(reads.includes("empty")))
  assert.equal(folder.getAttribute("aria-expanded"), "true")
  const image = screen.getByRole("treeitem", { name: "image.png" })
  assert.ok(image.querySelector('img[src$="/material-icons/image.svg"]'))
  await user.click(image)
  assert.ok(await screen.findByText("Binary or non-UTF-8 file. Preview unavailable."))
  assert.equal(document.querySelector(".diff-code"), null)
})

for (const surface of [
  "unit",
  "integration",
  "executed",
  "playwright-current",
  "playwright-recorded",
  "mcp",
]) {
  test(`${surface} 파일 보기는 원문과 줄 번호, 구문 강조를 공통으로 제공한다`, async () => {
    await i18n.changeLanguage("en")
    const path = "sample.test.ts"
    const source = 'const message = "<script>literal</script>"\nexpect(message).toBeDefined()\n'
    const submission = { id: "s", digest: "d", files: [{ path, source }], parsed: [] }
    let Component
    let props
    if (surface === "unit") {
      Component = (await server.ssrLoadModule("/src/components/unit-tests.tsx")).UnitTests
      props = {
        worktreeId: "w",
        scope: "all",
        api: {
          unitTests: async () => ({
            settings: { command: "pnpm test", cwd: ".", patterns: ["*.test.ts"] },
            catalog: { files: [{ path, source }], diagnostics: [] },
            runs: [],
          }),
        },
      }
    } else if (surface === "integration") {
      Component = (await server.ssrLoadModule("/src/components/test-observation.tsx"))
        .TestObservation
      props = {
        worktreeId: "w",
        scope: "all",
        api: {
          integrationTests: async () => ({
            directory: ".",
            catalog: { files: [{ path, source }], diagnostics: [] },
          }),
          submissions: async () => ({ items: [] }),
        },
      }
    } else if (surface === "executed") {
      Component = (await server.ssrLoadModule("/src/components/test-observation.tsx")).TestEvidence
      props = { submission, run: null }
    } else if (surface === "mcp") {
      Component = (await server.ssrLoadModule("/src/components/mcp/cards.tsx")).TestCard
      props = {
        data: {
          policy: "ask",
          review: { state: "pending", environmentApproved: false },
          submission,
        },
        actions: { busy: false },
      }
    } else {
      Component = (await server.ssrLoadModule("/src/components/project-playwright.tsx"))
        .PlaywrightSource
      props = {
        path,
        projectId: "p",
        runId: surface === "playwright-recorded" ? "r" : undefined,
        api: { captureSource: async () => source, projectPlaywrightSource: async () => source },
      }
    }
    const view = render(createElement(Component, props))
    const user = userEvent.setup({ document })
    if (surface === "executed") {
      await user.click(screen.getByRole("tab", { name: "Executed source" }))
    }
    if (surface === "mcp") {
      await user.click(screen.getByRole("tab", { name: "View test source" }))
    }
    await waitFor(() => assert.ok(view.container.textContent.includes("literal")))
    if (["executed", "mcp"].includes(surface)) {
      assert.ok(screen.getByRole("tree"), "Recorded sources retain file navigation")
    }
    const lines = [...view.container.querySelectorAll(".diff-code")]
    assert.equal(lines.length, 2, "Source uses numbered code rows")
    assert.equal(lines.map((line) => line.textContent).join("\n"), source.trimEnd())
    assert.ok(view.container.querySelector(".token.keyword"), "TypeScript syntax is highlighted")
    assert.ok(view.container.querySelector(".diff-gutter"), "Source retains line numbers")
    assert.equal(view.container.querySelector("script, .diff-code-insert, .diff-code-delete"), null)
    assert.equal(view.container.querySelectorAll("pre").length, 0)
  })
}

test("Capture 빈 상태는 내부 탭 없이 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const view = render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: { targets: {} }, runs: [] }),
        worktreePlaywrightCatalog: async () => ({ files: [], diagnostics: [] }),
      },
    }),
  )
  try {
    await screen.findByText("No recorded captures or tests match this worktree's changes.")
    assert.equal(screen.queryAllByRole("tab").length, 0)
    assert.equal(screen.queryAllByRole("combobox").length, 0)
  } finally {
    view.unmount()
  }
})

test("워크트리 UI 리뷰는 변경된 소스의 캡처와 테스트만 표시하고 원본 기록을 보존한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const scenario = (name) => ({
    id: name,
    title: name,
    file: `${name}.ts`,
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: name, name, contentType: "image/png" }],
  })
  const run = {
    id: "run",
    target: "captures",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    createdAt: "now",
    settings: { viewport: { width: 1280, height: 840 } },
    after: { cases: [scenario("unchanged"), scenario("changed")] },
  }
  const sources = []
  const api = {
    playwright: async () => ({
      settings: { targets: { captures: { purpose: "capture" } } },
      runs: [run],
    }),
    worktreePlaywrightCatalog: async () => ({
      files: [{ path: "changed.ts", target: "captures", purpose: "capture", scope: "project" }],
      diagnostics: [],
    }),
    captureArtifact: (_id, _side, id) => `/${id}.png`,
    captureSource: async (_id, path) => {
      sources.push(path)
      return "// changed source"
    },
  }
  const view = render(createElement(CaptureReview, { api, worktreeId: "w" }))
  await screen.findByAltText("changed")
  assert.ok(screen.queryByAltText("unchanged") === null, "Unchanged capture must be hidden")
  assert.ok(await screen.findByAltText("changed"))
  assert.equal(screen.queryAllByRole("combobox").length, 0)
  assert.deepEqual(sources, [], "Capture browsing does not fetch test code")
  assert.equal(run.after.cases.length, 2, "Review must not mutate retained evidence")
  view.unmount()
})

test("워크트리 변경 범위를 읽지 못하면 전체 기록으로 대체하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: { targets: {} }, runs: [] }),
        worktreePlaywrightCatalog: async () => {
          throw new Error("Cannot read review scope")
        },
      },
    }),
  )
  assert.ok(await screen.findByText("Cannot read review scope"))
  assert.equal(screen.getByRole("button", { name: "Run Playwright" }).disabled, true)
})

test("기능 테스트 파일은 UI 캡처 파일 목록에서 제외한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const scenario = (name) => ({
    id: name,
    title: name,
    file: `${name}.ts`,
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [],
  })
  const run = {
    id: "functional",
    target: "tests",
    purpose: "functional",
    scope: "worktree",
    state: "finished",
    outcome: "passed",
    createdAt: "now",
    settings: { viewport: { width: 1280, height: 840 } },
    after: { cases: [scenario("unrelated"), scenario("draft")] },
  }
  const reads = []
  const api = {
    playwright: async (id) =>
      id === "w" ? { settings: { targets: {} }, runs: [run] } : new Promise(() => {}),
    worktreePlaywrightCatalog: async (id) =>
      id === "w"
        ? {
            files: [
              { path: "draft.ts", target: "tests", purpose: "functional", scope: "worktree" },
            ],
            diagnostics: [],
          }
        : new Promise(() => {}),
    captureSource: async (_id, path) => {
      reads.push(path)
      return "// recorded draft"
    },
  }
  const view = render(createElement(CaptureReview, { api, worktreeId: "w" }))
  await screen.findByText("No recorded captures or tests match this worktree's changes.")
  assert.equal(screen.queryByRole("tree"), null)
  assert.equal(screen.queryByRole("button", { name: /Execution evidence/ }), null)
  assert.deepEqual(reads, [])
  view.rerender(createElement(CaptureReview, { api, worktreeId: "other" }))
  assert.ok(
    !screen.queryByRole("link", { name: "Executed source" }),
    "Previous worktree evidence must disappear immediately",
  )
})

test("변경 관련 증거가 없어도 진행 중 실행의 취소와 정리 상태는 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const run = {
    id: "active",
    target: "all",
    purpose: "functional",
    state: "running",
    createdAt: "now",
    settings: { viewport: { width: 1280, height: 840 } },
    after: { cases: [] },
  }
  const cancelled = []
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: { targets: {} }, runs: [run] }),
        worktreePlaywrightCatalog: async () => ({
          files: [],
          diagnostics: ["Comparison unavailable"],
        }),
        cancelPlaywright: async (id) => {
          cancelled.push(id)
          return { ...run, state: "finished", outcome: "cancelled" }
        },
      },
    }),
  )
  const cancel = await screen.findByRole("button", { name: "Cancel", exact: true })
  assert.equal(screen.getByRole("button", { name: "Run Playwright" }).disabled, true)
  await userEvent.setup().click(cancel)
  await waitFor(() => assert.deepEqual(cancelled, ["active"]))
  await screen.findByText("No recorded captures or tests match this worktree's changes.")
})

test("프로젝트 기본 경로가 없으면 기능 워크트리의 테스트를 조회하거나 실행하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectTests } = await server.ssrLoadModule("/src/components/project-tests.tsx")
  render(
    createElement(ProjectTests, {
      api: { unitTests: async () => assert.fail("Feature checkout must not be inspected") },
      projectId: "project",
      primaryRoot: "/repo/main",
      worktrees: [
        { id: "feature", projectId: "project", checkoutRoot: "/repo/feature" },
        { id: "other", projectId: "other-project", checkoutRoot: "/repo/main" },
      ],
    }),
  )
  assert.ok(screen.getByText("Project checkout unavailable."))
  assert.equal(screen.getByRole("button", { name: "Run Unit command" }).disabled, true)
  assert.equal(screen.queryByRole("combobox", { name: "Worktree" }), null)
})

test("project integration defaults load automatic choices and save without starting tests", async () => {
  await i18n.changeLanguage("en")
  const { SelectionForm } = await server.ssrLoadModule("/src/components/worktree-environments.tsx")
  const writes = []
  const api = {
    worktreeDependencies: async () => ({
      valid: true,
      services: ["app"],
      dependencies: { payments: { modes: { mock: {}, remote: {} } } },
    }),
    projectIntegrationDefaults: async (id) => {
      assert.equal(id, "project")
      return { saved: false, selection: { services: ["app"], select: { payments: "mock" } } }
    },
    setProjectIntegrationDefaults: async (id, selection) => {
      writes.push({ id, selection })
      return { selection }
    },
    setWorktreeSelection: () => assert.fail("Project defaults must not save worktree choices"),
    runIntegrationTests: () => assert.fail("Saving must not run tests"),
  }
  render(createElement(SelectionForm, { api, worktreeId: "primary", projectId: "project" }))
  const user = userEvent.setup({ document })
  await screen.findByRole("combobox", { name: "payments" })
  assert.equal(
    screen.getByRole("button", { name: "app", exact: true }).getAttribute("aria-pressed"),
    "true",
  )
  await user.click(screen.getByRole("combobox", { name: "payments" }))
  await user.click(await screen.findByRole("option", { name: "Remote connection" }))
  await user.click(screen.getByRole("button", { name: "Save selection" }))
  await screen.findByText("Selection saved.")
  assert.deepEqual(writes, [
    { id: "project", selection: { services: ["app"], select: { payments: "remote" } } },
  ])
})

test("Capture 파일을 바꾸면 내부 탭 없이 해당 이미지를 바로 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const user = userEvent.setup()
  const cases = ["a.spec.ts", "b.spec.ts"].map((file) => ({
    id: file,
    file,
    title: file,
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: file, name: file, contentType: "image/png" }],
  }))
  const run = {
    id: "record",
    target: "captures",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    createdAt: "now",
    settings: { viewport: { width: 1920, height: 1080 } },
    after: { cases },
  }
  const reads = []
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({ settings: { targets: {} }, runs: [run] }),
        worktreePlaywrightCatalog: async () => ({
          files: cases.map((c) => ({ path: c.file, target: "captures", purpose: "capture" })),
          diagnostics: [],
        }),
        captureArtifact: (_run, _side, id) => `/${id}.png`,
        captureSource: async (id, path) => {
          reads.push([id, path])
          return `// ${path}`
        },
      },
    }),
  )
  const tree = await screen.findByRole("tree")
  assert.equal(screen.queryByRole("button", { name: "Recorded execution" }), null)
  await user.click(within(tree).getByText("b.spec.ts"))
  assert.ok(await screen.findByAltText("b.spec.ts"))
  assert.equal(screen.queryByAltText("a.spec.ts"), null)
  assert.equal(screen.queryAllByRole("tab").length, 0)
  assert.ok(screen.getByRole("tree"))
  await user.click(within(tree).getByText("a.spec.ts"))
  assert.ok(await screen.findByAltText("a.spec.ts"))
  assert.deepEqual(reads, [])
})

test("프로젝트 캡처와 이력의 파일 목록은 코드 전환 뒤에도 유지된다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  const cases = ["one.ts", "two.ts"].map((file) => ({
    id: file,
    file,
    title: file,
    status: "passed",
    steps: [],
    errors: [],
    artifacts: [{ id: file, name: file, contentType: "image/png" }],
  }))
  const run = {
    id: "run",
    target: "capture",
    purpose: "capture",
    scope: "project",
    state: "finished",
    outcome: "passed",
    createdAt: "now",
    settings: { viewport: { width: 1920, height: 1080 } },
    after: { cases },
  }
  render(
    createElement(ProjectPlaywright, {
      projectId: "p",
      api: {
        projectPlaywright: async () => ({ runs: [run] }),
        projectPlaywrightCatalog: async () => ({ files: [] }),
        captureArtifact: (_run, _side, id) => `/${id}.png`,
        captureSource: async (_run, path) => `// recorded ${path}`,
      },
    }),
  )
  const user = userEvent.setup()
  await screen.findByAltText("one.ts")
  assert.ok(screen.queryByText(/^[0-9]+ files?$/) === null)
  assert.ok(screen.queryByText("+0") === null)
  assert.ok(screen.queryByText("−0") === null)
  const tree = screen.getByRole("tree")
  await user.click(within(tree).getByText("two.ts"))
  assert.ok(await screen.findByAltText("two.ts"))
  await user.click(screen.getByRole("tab", { name: "Test Code" }))
  assert.ok(await screen.findByText("// recorded two.ts"))
  assert.ok(screen.getByRole("tree"))
  await user.click(screen.getByRole("tab", { name: "Runs", exact: true }))
  assert.ok(screen.getByRole("tree"))
  await user.click(within(screen.getByRole("tree")).getByText("two.ts"))
  await user.click(screen.getByRole("tab", { name: "Test Code" }))
  assert.ok(await screen.findByText("// recorded two.ts"))
  assert.ok(screen.getByRole("tree"))
})

test("브랜치 변경 파일 목록은 선택한 삭제 파일의 diff만 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { BranchReview } = await server.ssrLoadModule("/src/components/branch-review.tsx")
  const patch =
    "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-oldA\n+newA\ndiff --git a/b.ts b/b.ts\ndeleted file mode 100644\n--- a/b.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-removedB\n"
  const view = render(
    createElement(BranchReview, {
      projectId: "p",
      branch: "feature",
      api: { branchDiff: async () => ({ available: true, patch, omitted: [] }) },
    }),
  )
  const tree = await screen.findByRole("tree")
  assert.match(view.container.textContent, /newA/)
  assert.doesNotMatch(view.container.textContent, /removedB/)
  await userEvent.setup().click(await within(tree).findByText("b.ts"))
  assert.match(view.container.textContent, /removedB/)
  assert.doesNotMatch(view.container.textContent, /newA/)
})

test("MCP 파일 목록은 같은 이름의 다른 파일 결과와 소스를 섞지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { TestCard } = await server.ssrLoadModule("/src/components/mcp/cards.tsx")
  const files = [
    { path: "a.ts", source: "// first" },
    { path: "b.ts", source: "// second" },
  ]
  const view = render(
    createElement(TestCard, {
      data: {
        policy: "ask",
        submission: { digest: "d", files, parsed: [] },
        run: {
          state: "finished",
          result: {
            outcome: "assertion_failed",
            errors: [],
            cases: [
              { file: "a.ts", name: "same", state: "passed", errors: [] },
              {
                file: "b.ts",
                name: "same",
                state: "failed",
                errors: [{ name: "Error", message: "second failure" }],
              },
            ],
          },
        },
      },
      actions: { busy: false },
    }),
  )
  const user = userEvent.setup()
  const tree = screen.getByRole("tree")
  assert.doesNotMatch(view.container.textContent, /second failure/)
  await user.click(within(tree).getByText("b.ts"))
  assert.match(view.container.textContent, /second failure/)
  await user.click(screen.getByRole("tab", { name: "View test source" }))
  assert.ok(screen.getByText("// second"))
  await user.click(within(tree).getByText("a.ts"))
  assert.ok(screen.getByText("// first"))
  assert.equal(screen.queryByText("// second"), null)
})

test("공통 파일 탐색은 선택 상자로 대체하지 않고 파일 목록과 뷰를 함께 유지한다", async () => {
  const { TestFileBrowser } = await server.ssrLoadModule("/src/components/test-file-browser.tsx")
  render(
    createElement(
      TestFileBrowser,
      { files: [{ path: "one.ts" }], path: "one.ts", label: "Files", onSelect() {} },
      "File content",
    ),
  )
  assert.ok(screen.getByRole("tree"))
  assert.ok(screen.queryByRole("combobox") === null, "File navigation must not use a picker")
  assert.ok(screen.getByText("File content"))
})

test("테스트 실행은 상단 툴바에만 표시되고 탭 전환 시 이전 작업이 숨겨진다", async () => {
  await i18n.changeLanguage("en")
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  render(
    createElement(WorktreeReview, {
      worktreeId: "minimal",
      initialTab: "unit",
      api: {
        gitDiff: async () => ({
          available: true,
          patch:
            "diff --git a/readme.txt b/readme.txt\n--- a/readme.txt\n+++ b/readme.txt\n@@ -1 +1 @@\n-old\n+new\n",
          omitted: [],
        }),
        unitTests: async () => ({
          settings: {
            command: "pnpm exec vitest run unit",
            dockerfile: "Dockerfile.test",
            cwd: ".",
            patterns: [],
          },
          catalog: { files: [{ path: "unit.test.ts", source: "test" }], diagnostics: [] },
          runs: [],
        }),
        integrationTests: async () => ({
          directory: "tests",
          catalog: { files: [], diagnostics: [] },
        }),
        submissions: async () => ({ items: [{ id: "s" }] }),
        submission: async () => ({ id: "s", files: [], parsed: [] }),
        runs: async () => ({ items: [] }),
      },
    }),
  )
  await screen.findAllByText("unit.test.ts")
  const run = screen.getByRole("button", { name: "Run Unit command" })
  assert.ok(run.closest('[data-slot="review-toolbar"]'))
  assert.equal(run.querySelector('[data-icon="inline-start"]'), null)
  assert.equal(screen.queryByText("pnpm exec vitest run unit"), null)
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("tab", { name: "Integration Test", exact: true }))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Run Integration tests" }).disabled, false),
  )
  assert.equal(screen.getAllByRole("button", { name: "Run Integration tests" }).length, 1)
  assert.ok(
    screen
      .getByRole("button", { name: "Run Integration tests" })
      .closest('[data-slot="review-toolbar"]'),
  )
  assert.equal(
    screen
      .getByRole("button", { name: "Run Integration tests" })
      .querySelector('[data-icon="inline-start"]'),
    null,
  )
  await user.click(screen.getByRole("tab", { name: "Diff", exact: true }))
  assert.equal(screen.queryByRole("button", { name: "Run Integration tests" }), null)
  await user.click(screen.getByRole("tab", { name: "Unit Test", exact: true }))
  assert.equal(screen.getAllByRole("button", { name: "Run Unit command" }).length, 1)
})

test("설정 도움말은 본문 공간을 차지하지 않고 키보드 포커스로 읽을 수 있다", async () => {
  const { SettingsRow } = await server.ssrLoadModule("/src/components/settings-row.tsx")
  render(
    createElement(
      SettingsRow,
      { title: "Approval", description: "Applies to future requests." },
      "Auto",
    ),
  )
  assert.ok(!screen.queryByText("Applies to future requests."))
  await userEvent.setup().tab()
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Approval" }))
  assert.ok(await screen.findByRole("tooltip"))
  assert.ok(screen.getByText("Applies to future requests."))
  await userEvent.setup().keyboard("{Escape}")
  await waitFor(() => assert.ok(!screen.queryByRole("tooltip")))
})

test("빈 프로젝트 Playwright도 탐색과 실행 위치를 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  render(
    createElement(ProjectPlaywright, {
      projectId: "empty",
      api: {
        projectPlaywright: async () => ({ runs: [] }),
        projectPlaywrightCatalog: async () => ({ files: [] }),
      },
    }),
  )
  await screen.findByText("No screenshots yet. Run a capture target from a worktree.")
  assert.ok(screen.getByRole("tablist", { name: "Playwright" }))
  assert.ok(screen.getByRole("button", { name: "Run Playwright" }))
})

test("프로젝트 Tests에 파일이 없으면 내부 코드 결과 탭을 표시하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  render(
    createElement(ProjectPlaywright, {
      projectId: "capture-only",
      api: {
        projectPlaywright: async () => ({ runs: [] }),
        projectPlaywrightCatalog: async () => ({
          files: [{ path: "capture.ts", purpose: "capture" }],
        }),
      },
    }),
  )
  await userEvent.setup().click(await screen.findByRole("tab", { name: "Tests", exact: true }))
  await screen.findByText(
    "No functional Playwright files. Declare a functional target in Project settings.",
  )
  assert.equal(screen.queryByRole("tab", { name: "Code", exact: true }), null)
  assert.equal(screen.queryByRole("tab", { name: "Execution results" }), null)
})

test("프로젝트 Capture는 실행 전에도 코드와 스크린샷을 파일별로 분리한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectPlaywright } = await server.ssrLoadModule("/src/components/project-playwright.tsx")
  render(
    createElement(ProjectPlaywright, {
      projectId: "capture-only",
      api: {
        projectPlaywright: async () => ({ runs: [] }),
        projectPlaywrightCatalog: async () => ({
          files: [{ path: "capture.ts", target: "captures", purpose: "capture" }],
        }),
        projectPlaywrightSource: async (_id, path) => `// ${path}`,
      },
    }),
  )
  await screen.findByRole("treeitem", { name: "capture.ts", exact: true })
  const user = userEvent.setup()
  const tabs = screen.getByRole("tablist", { name: "Captures", exact: true })
  await user.click(within(tabs).getByRole("tab", { name: "Test Code", exact: true }))
  assert.ok(await screen.findByText("// capture.ts"))
  await user.click(within(tabs).getByRole("tab", { name: "Screenshots", exact: true }))
  await screen.findByText("No screenshots yet. Run a capture target from a worktree.")
  assert.ok(screen.getByRole("treeitem", { name: "capture.ts", exact: true }))
})

test("UI 리뷰는 모바일 모드 토글로 저장된 모바일과 데스크톱 캡처를 분리한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const calls = []
  const record = (id, width) => ({
    id,
    target: "captures",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    settings: { viewport: { width, height: 812 } },
    after: {
      cases: [
        {
          id,
          file: "phone.ts",
          title: id,
          errors: [],
          steps: [],
          artifacts: [{ id, name: id, contentType: "image/png", viewport: { width, height: 812 } }],
        },
      ],
    },
  })
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({
          settings: {
            targets: { captures: { purpose: "capture" } },
            viewport: { width: 1920, height: 1080 },
            mobileViewport: { width: 390, height: 844 },
          },
          runs: [record("mobile-shot", 375), record("desktop-shot", 1920)],
        }),
        worktreePlaywrightCatalog: async () => ({
          files: [{ path: "phone.ts", target: "captures", purpose: "capture" }],
          diagnostics: [],
        }),
        captureArtifact: (id) => `/${id}.png`,
        runPlaywright: async (...args) => {
          calls.push(args)
          throw new Error("Request recorded")
        },
      },
    }),
  )
  const user = userEvent.setup()
  await screen.findByAltText("desktop-shot")
  const mobileMode = screen.getByRole("switch", { name: "Mobile" })
  assert.equal(mobileMode.getAttribute("aria-checked"), "false")
  await user.click(mobileMode)
  await screen.findByAltText("mobile-shot")
  assert.equal(screen.queryByAltText("desktop-shot"), null)
  await user.click(screen.getByRole("button", { name: "Run Playwright" }))
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], ["w", undefined, { width: 390, height: 844 }, "captures"])
  await user.click(mobileMode)
  assert.equal(mobileMode.getAttribute("aria-checked"), "false")
  await screen.findByAltText("desktop-shot")
  assert.equal(screen.queryByAltText("mobile-shot"), null)
})

test("전역 파일 목록은 통계 없이 탐색하고 워크트리 모드는 변경 통계를 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { FileList } = await server.ssrLoadModule("/src/components/changed-file-list.tsx")
  const selected = []
  const props = {
    files: [{ path: "src/one.ts", type: "modify", additions: 3, deletions: 2 }],
    selectedPath: "src/one.ts",
    onSelect: (path) => selected.push(path),
    label: "Files",
    mode: "project",
  }
  const view = render(createElement(FileList, props))
  assert.ok(screen.queryByText("1 file") === null, "전역에는 파일 개수 요약이 없어야 한다")
  assert.ok(screen.queryByText("+3") === null)
  assert.ok(screen.queryByText("−2") === null)
  assert.ok(screen.queryByText("M") === null)
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("treeitem", { name: /one.ts/ }))
  assert.deepEqual(selected, ["src/one.ts"])
  view.rerender(createElement(FileList, { ...props, mode: "worktree" }))
  assert.ok(screen.getByText("1 file"))
  assert.equal(screen.getAllByText("+3").length, 2)
  assert.equal(screen.getAllByText("−2").length, 2)
  assert.ok(screen.getByText("M"))
})

test("공통 테스트 탐색기는 전역 모드를 파일 목록에 전달한다", async () => {
  await i18n.changeLanguage("en")
  const { TestFileBrowser } = await server.ssrLoadModule("/src/components/test-file-browser.tsx")
  render(
    createElement(
      TestFileBrowser,
      {
        mode: "project",
        files: [{ path: "one.test.ts" }],
        path: "one.test.ts",
        label: "Tests",
        onSelect() {},
      },
      "Test content",
    ),
  )
  assert.ok(screen.getByRole("treeitem", { name: /one.test.ts/ }))
  assert.ok(screen.getByText("Test content"))
  assert.ok(screen.queryByText("1 file") === null, "전역에는 파일 개수 요약이 없어야 한다")
  assert.ok(screen.queryByText("+0") === null)
  assert.ok(screen.queryByText("−0") === null)
})

test("Tests의 Playwright 선택은 해당 자료만 조회하고 공통 실행 버튼을 전환한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectTests } = await server.ssrLoadModule("/src/components/project-tests.tsx")
  const calls = []
  const api = {
    unitTests: async () => {
      calls.push("unit")
      return { settings: null, catalog: { files: [], diagnostics: [] }, runs: [] }
    },
    projectPlaywright: async () => {
      calls.push("playwright")
      return { runs: [] }
    },
    projectPlaywrightCatalog: async () => ({ files: [] }),
    runPlaywright: async () => assert.fail("탭 선택만으로 실행하면 안 된다"),
  }
  render(
    createElement(ProjectTests, {
      api,
      projectId: "p",
      primaryRoot: "/repo",
      worktrees: [{ id: "primary", projectId: "p", checkoutRoot: "/repo" }],
    }),
  )
  await waitFor(() => assert.deepEqual(calls, ["unit"]))
  const user = userEvent.setup({ document })
  const tab = screen.queryByRole("tab", { name: "Playwright", exact: true })
  assert.ok(tab)
  const toolbar = tab.closest('[data-slot="review-toolbar"]')
  await user.click(tab)
  await waitFor(() => assert.deepEqual(calls, ["unit", "playwright"]))
  assert.equal(screen.getAllByRole("button", { name: "Run Playwright", exact: true }).length, 1)
  assert.ok(within(toolbar).getByRole("button", { name: "Run Playwright", exact: true }))
  assert.equal(
    within(toolbar).getByRole("button", { name: "Run Playwright", exact: true }).disabled,
    false,
  )
  assert.equal(document.querySelectorAll('[data-slot="review-toolbar"]').length, 1)
  const runsTab = within(toolbar).getByRole("tab", { name: "Runs", exact: true })
  await user.click(runsTab)
  assert.equal(runsTab.getAttribute("aria-selected"), "true")
  assert.equal(tab.getAttribute("aria-selected"), "true", "하위 탭은 테스트 종류를 바꾸지 않는다")
  assert.ok(screen.getByText("No Playwright executions yet."))
  await user.keyboard("{ArrowLeft}")
  assert.equal(
    within(toolbar).getByRole("tab", { name: "Tests", exact: true }).getAttribute("aria-selected"),
    "true",
  )
  assert.equal(tab.getAttribute("aria-selected"), "true")
  await user.click(screen.getByRole("tab", { name: "Unit", exact: true }))
  assert.equal(within(toolbar).queryByRole("tab", { name: "Runs", exact: true }), null)
  await waitFor(() => assert.deepEqual(calls, ["unit", "playwright", "unit"]))
  assert.ok(screen.queryByRole("region", { name: "Playwright", exact: true }) === null)
  assert.equal(screen.getAllByRole("button", { name: "Run Unit command", exact: true }).length, 1)
  assert.equal(
    within(toolbar).getByRole("button", { name: "Run Unit command", exact: true }).disabled,
    true,
  )
})

test("프로젝트 선택 옆 메뉴에서 항목을 숨겨도 현재 Container와 worktree 접근을 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const actions = []
  render(
    createElement(ProjectManager, {
      initialProjects: [project],
      api: {
        ...sampleApi(),
        testContainer: async () => ({
          target: { branch: "local" },
          environment: null,
          composeFiles: [],
        }),
        testContainerAction: async (...args) => actions.push(args),
      },
    }),
  )
  const user = userEvent.setup({ document })
  const options = screen.queryByRole("button", { name: "Project menu options" })
  assert.ok(options, "프로젝트 선택 옆에 메뉴 표시 버튼이 있어야 한다")
  const header = options.closest('[data-slot="sidebar-header"]')
  assert.ok(within(header).getByRole("button", { name: project.name }))
  assert.equal(screen.queryByRole("button", { name: "Playwright", exact: true }), null)
  assert.equal(screen.queryByRole("button", { name: "Test Container", exact: true }), null)
  await user.click(screen.getByRole("button", { name: "Container", exact: true }))
  await screen.findByRole("button", { name: "Start", exact: true })
  await user.click(options)
  const popup = await screen.findByRole("menu")
  assert.equal(within(popup).getAllByRole("menuitemcheckbox").length, 6)
  for (const name of ["Container", "File Viewer", "Dependencies"]) {
    await user.click(within(popup).getByRole("menuitemcheckbox", { name, exact: true }))
    assert.equal(
      within(popup)
        .getByRole("menuitemcheckbox", { name, exact: true })
        .getAttribute("aria-checked"),
      "false",
    )
  }
  await user.keyboard("{Escape}")
  await waitFor(() => assert.equal(document.activeElement === options, true))
  assert.equal(screen.queryByRole("button", { name: "Container", exact: true }), null)
  assert.ok(screen.getByRole("region", { name: "Container", exact: true }))
  assert.ok(screen.getByRole("button", { name: "Settings", exact: true }))
  assert.ok(screen.getByRole("navigation", { name: "Worktrees" }))
  assert.equal(options.getAttribute("aria-label"), "Project menu options (3 hidden)")
  assert.deepEqual(actions, [], "표시 선택으로 컨테이너를 실행하거나 중단해서는 안 된다")
  await user.click(options)
  await user.click(await screen.findByRole("menuitem", { name: "Show all" }))
  await user.keyboard("{Escape}")
  assert.ok(screen.getByRole("button", { name: "Container", exact: true }))
  assert.ok(screen.getByRole("button", { name: "File Viewer", exact: true }))
})

test("프로젝트 메뉴 표시 선택은 프로젝트 전환과 다시 열기 후에도 각각 유지된다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const second = {
    ...project,
    id: "second",
    name: "Second project",
    location: { kind: "directory", root: "/second" },
  }
  const props = { api: sampleApi(), initialProjects: [project, second] }
  let view = render(createElement(ProjectManager, props))
  const user = userEvent.setup({ document })
  assert.ok(screen.queryByRole("button", { name: "Project menu options" }))
  await user.click(screen.getByRole("button", { name: "Project menu options" }))
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "File Viewer" }))
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: project.name }))
  await user.click(await screen.findByRole("menuitemradio", { name: second.name }))
  assert.ok(screen.getByRole("button", { name: "File Viewer" }))
  await user.click(screen.getByRole("button", { name: "Project menu options" }))
  assert.equal(screen.queryByRole("menuitemcheckbox", { name: "Git Graph" }), null)
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Container" }))
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: second.name }))
  await user.click(await screen.findByRole("menuitemradio", { name: project.name }))
  assert.equal(screen.queryByRole("button", { name: "File Viewer" }), null)
  assert.ok(screen.getByRole("button", { name: "Container" }))
  view.unmount()
  view = render(createElement(ProjectManager, props))
  assert.equal(screen.queryByRole("button", { name: "File Viewer" }), null)
  assert.ok(screen.getByRole("button", { name: "Container" }))
  view.unmount()
})

test("메뉴 표시 저장소가 잘못되거나 차단되어도 키보드로 전체 메뉴를 숨기고 복원한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  localStorage.setItem(`redpact:project-navigation:${project.id}`, "invalid json")
  const storage = Object.getPrototypeOf(localStorage)
  const setItem = storage.setItem
  storage.setItem = () => {
    throw new Error("Storage unavailable")
  }
  try {
    render(createElement(ProjectManager, { api: sampleApi(), initialProjects: [project] }))
    const user = userEvent.setup({ document })
    const options = screen.queryByRole("button", { name: "Project menu options" })
    assert.ok(options)
    options.focus()
    await user.keyboard("{Enter}")
    for (const checkbox of await screen.findAllByRole("menuitemcheckbox")) {
      await user.click(checkbox)
    }
    await user.keyboard("{Escape}")
    assert.equal(screen.queryByRole("button", { name: "Tests", exact: true }), null)
    assert.ok(screen.getByRole("button", { name: project.name }))
    assert.ok(screen.getByRole("button", { name: "Settings", exact: true }))
    await user.click(options)
    await user.click(await screen.findByRole("menuitem", { name: "Show all" }))
    await user.keyboard("{Escape}")
    assert.ok(screen.getByRole("button", { name: "Tests", exact: true }))
  } finally {
    storage.setItem = setItem
  }
})

test("Test Container는 화면 진입으로 실행하지 않고 사용자가 재실행과 종료를 선택한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectTestContainer } = await server.ssrLoadModule(
    "/src/components/project-test-container.tsx",
  )
  const calls = []
  const target = { id: "main", branch: "main", projectRoot: "/repo" }
  let data = { target, environment: null, changed: null, issue: null, composeFiles: [] }
  const api = {
    testContainer: async () => data,
    testContainerAction: async (_projectId, action) => {
      calls.push(action)
      data = {
        target,
        environment:
          action === "stop"
            ? null
            : {
                state: "ready",
                target: { projectRoot: "/repo" },
                endpoints: {},
                errors: [],
              },
        changed: action === "stop" ? null : false,
        issue: null,
        composeFiles: [],
      }
      return data
    },
  }
  render(createElement(ProjectTestContainer, { api, projectId: "project" }))
  const user = userEvent.setup()
  await screen.findByRole("button", { name: "Start", exact: true })
  assert.deepEqual(calls, [])
  await user.click(screen.getByRole("button", { name: "Start", exact: true }))
  await screen.findByRole("button", { name: "Restart with latest code" })
  await user.click(screen.getByRole("button", { name: "Restart with latest code" }))
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Stop", exact: true }).disabled, false),
  )
  await user.click(screen.getByRole("button", { name: "Stop", exact: true }))
  await screen.findByRole("button", { name: "Start", exact: true })
  assert.deepEqual(calls, ["start", "restart", "stop"])
})

test("Test Container 실행 오류는 다음 조회로 사라지지 않고 재시도를 허용한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectTestContainer } = await server.ssrLoadModule(
    "/src/components/project-test-container.tsx",
  )
  const api = {
    testContainer: async () => ({
      target: { branch: "main", projectRoot: "/repo" },
      environment: null,
      changed: null,
      issue: null,
      composeFiles: [],
    }),
    testContainerAction: async () => {
      throw new Error("Docker unavailable")
    },
  }
  render(createElement(ProjectTestContainer, { api, projectId: "project" }))
  const user = userEvent.setup()
  await user.click(await screen.findByRole("button", { name: "Start", exact: true }))
  await screen.findByText("Error: Docker unavailable")
  await waitFor(() =>
    assert.equal(screen.getByRole("button", { name: "Start", exact: true }).disabled, false),
  )
  assert.ok(screen.getByText("Error: Docker unavailable"))
})

test("툴바 override는 생략한 슬롯을 유지하고 null로 숨기며 해제 시 기본값을 복원한다", async () => {
  const { ReviewToolbar, ReviewToolbarScope, ReviewToolbarOverride } = await server.ssrLoadModule(
    "/src/components/review-toolbar.tsx",
  )
  function view(override) {
    return createElement(
      ReviewToolbarScope,
      null,
      createElement(ReviewToolbar, {
        navigation: createElement("button", null, "기본 탐색"),
        secondary: createElement("button", null, "기본 보조 탐색"),
        actions: createElement("button", null, "기본 실행"),
      }),
      override && createElement(ReviewToolbarOverride, override),
    )
  }
  const mounted = render(
    view({ secondary: createElement("button", null, "하위 탐색"), actions: null }),
  )
  assert.ok(screen.getByRole("button", { name: "기본 탐색" }))
  assert.ok(screen.getByRole("button", { name: "하위 탐색" }))
  assert.equal(screen.queryByRole("button", { name: "기본 보조 탐색" }), null)
  assert.equal(screen.queryByRole("button", { name: "기본 실행" }), null)
  mounted.rerender(view({ actions: createElement("button", null, "새 실행") }))
  assert.ok(screen.getByRole("button", { name: "기본 보조 탐색" }))
  assert.ok(screen.getByRole("button", { name: "새 실행" }))
  assert.equal(screen.queryByRole("button", { name: "하위 탐색" }), null)
  mounted.rerender(view(null))
  assert.ok(screen.getByRole("button", { name: "기본 실행" }))
  assert.equal(screen.queryByRole("button", { name: "새 실행" }), null)
  assert.equal(document.querySelectorAll('[data-slot="review-toolbar"]').length, 1)
})

test("빈 워크트리 리뷰는 내용 없는 탭을 숨긴다", async () => {
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  await i18n.changeLanguage("en")
  render(
    createElement(WorktreeReview, {
      worktreeId: "empty",
      api: {
        reviewContent: async () => ({
          preview: false,
          unit: false,
          tests: false,
          log: false,
          environment: false,
        }),
        gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
        playwright: async () => ({ settings: null, runs: [] }),
        worktreePlaywrightCatalog: async () => ({ files: [], diagnostics: [] }),
        unitTests: async () => ({
          settings: null,
          catalog: { files: [], diagnostics: [] },
          runs: [],
        }),
        integrationTests: async () => ({
          directory: "tests",
          catalog: { files: [], diagnostics: [] },
        }),
        submissions: async () => ({ items: [] }),
        executionLogs: async () => ({ items: [] }),
        environments: async () => [],
        mergeInspection: async () => ({ source: { files: [] }, target: null, records: [] }),
      },
    }),
  )
  await waitFor(() => assert.equal(screen.queryAllByRole("tab").length, 0))
  assert.ok(screen.getByText("No review content yet."))
})

test("UI 리뷰 파일 목록은 실행 여부나 이미지 크기와 관계없이 캡처 소스를 포함한다", async () => {
  const { captureFiles } = await server.ssrLoadModule("/src/lib/review-content.ts")
  const file = (path, purpose = "capture") => ({ path, target: purpose, purpose })
  const files = [
    file("shown.ts"),
    file("empty.ts"),
    file("never.ts"),
    file("functional.ts", "functional"),
    file("mobile.ts"),
  ]
  assert.deepEqual(
    captureFiles(files).map((file) => file.path),
    ["shown.ts", "empty.ts", "never.ts", "mobile.ts"],
  )
})

test("새 리뷰 내용은 탭을 다시 표시하고 사라진 선택은 남은 탭으로 이동한다", async () => {
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const { act } = await import("react")
  await i18n.changeLanguage("en")
  const previous = window.EventSource
  const events = []
  window.EventSource = class {
    constructor() {
      events.push(this)
    }
    addEventListener() {}
    close() {
      this.closed = true
    }
  }
  let hasUnit = false
  let hasTests = true
  const api = {
    reviewContent: async () => ({
      preview: false,
      unit: hasUnit,
      tests: hasTests,
      log: false,
      environment: false,
    }),
    gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
    playwright: async () => ({ settings: null, runs: [] }),
    worktreePlaywrightCatalog: async () => ({ files: [], diagnostics: [] }),
    unitTests: async () => ({
      settings: null,
      catalog: { files: hasUnit ? [{ path: "unit.ts", source: "unit" }] : [], diagnostics: [] },
      runs: [],
    }),
    integrationTests: async () => ({
      directory: "tests",
      catalog: {
        files: hasTests ? [{ path: "integration.ts", source: "integration" }] : [],
        diagnostics: [],
      },
    }),
    submissions: async () => ({ items: [] }),
    executionLogs: async () => ({ items: [] }),
    environments: async () => [],
    mergeInspection: async () => ({ source: { files: [] }, target: null, records: [] }),
  }
  const refresh = async () => {
    await act(async () => {
      for (const event of [...events]) {
        if (!event.closed) {
          event.onmessage?.()
        }
      }
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100))
    })
  }
  const view = render(createElement(WorktreeReview, { api, worktreeId: "dynamic" }))
  try {
    await waitFor(() =>
      assert.deepEqual(
        screen.getAllByRole("tab").map((tab) => tab.textContent),
        ["Integration Test"],
      ),
    )
    hasUnit = true
    await refresh()
    assert.equal(
      screen.getByRole("tab", { name: "Integration Test" }).getAttribute("aria-selected"),
      "true",
    )
    assert.ok(screen.getByRole("tab", { name: "Unit Test" }))
    hasTests = false
    await refresh()
    assert.equal(screen.queryByRole("tab", { name: "Integration Test" }), null)
    assert.equal(
      screen.getByRole("tab", { name: "Unit Test" }).getAttribute("aria-selected"),
      "true",
    )
    hasUnit = false
    await refresh()
    assert.equal(screen.queryAllByRole("tab").length, 0)
    assert.ok(screen.getByText("No review content yet."))
  } finally {
    view.unmount()
    window.EventSource = previous
  }
})

test("한 실행의 캡처를 실제 viewport로 분류하고 이름과 실행 설정은 무시한다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const calls = []
  const record = (id, width) => ({
    id,
    target: "captures",
    purpose: "capture",
    state: "finished",
    outcome: "passed",
    settings: { viewport: { width, height: 812 } },
    after: {
      cases: [
        {
          id,
          file: "phone.ts",
          title: id,
          errors: [],
          steps: [],
          artifacts: [{ id, name: id, contentType: "image/png", viewport: { width, height: 812 } }],
        },
      ],
    },
  })
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({
          settings: {
            targets: { captures: { purpose: "capture" } },
            viewport: { width: 1920, height: 1080 },
            mobileViewport: { width: 390, height: 844 },
          },
          runs: [
            {
              ...record("mixed", 1920),
              after: {
                cases: [
                  {
                    ...record("mixed", 1920).after.cases[0],
                    artifacts: [
                      {
                        id: "mobile",
                        name: "mobile-shot",
                        contentType: "image/png",
                        viewport: { width: 414, height: 896 },
                      },
                      {
                        id: "desktop",
                        name: "desktop-shot",
                        contentType: "image/png",
                        viewport: { width: 768, height: 900 },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
        worktreePlaywrightCatalog: async () => ({
          files: [{ path: "phone.ts", target: "captures", purpose: "capture" }],
          diagnostics: [],
        }),
        captureArtifact: (id) => `/${id}.png`,
        runPlaywright: async (...args) => {
          calls.push(args)
          throw new Error("Request recorded")
        },
      },
    }),
  )
  const user = userEvent.setup()
  await screen.findByAltText("desktop-shot")
  const mobileMode = screen.getByRole("switch", { name: "Mobile" })
  assert.equal(mobileMode.getAttribute("aria-checked"), "false")
  await user.click(mobileMode)
  await screen.findByAltText("mobile-shot")
  assert.equal(screen.queryByAltText("desktop-shot"), null)
  await user.click(screen.getByRole("button", { name: "Run Playwright" }))
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], ["w", undefined, { width: 390, height: 844 }, "captures"])
  await user.click(mobileMode)
  assert.equal(mobileMode.getAttribute("aria-checked"), "false")
  await screen.findByAltText("desktop-shot")
  assert.equal(screen.queryByAltText("mobile-shot"), null)
})

test("파일 목록은 빈 실행도 유지하고 이미지 필터는 캡처 viewport를 따른다", async () => {
  const { captureFiles, captureRunMatchesMode } = await server.ssrLoadModule(
    "/src/lib/review-content.ts",
  )
  const files = ["mixed.ts", "unknown.ts", "empty.ts"].map((path) => ({
    path,
    target: "captures",
    purpose: "capture",
  }))
  const run = (path, widths) => ({
    purpose: "capture",
    target: "captures",
    settings: { viewport: { width: 1920, height: 1080 } },
    after: {
      cases: [
        {
          file: path,
          artifacts: widths.map((width) => ({
            contentType: "image/png",
            ...(width ? { viewport: { width, height: 896 } } : {}),
          })),
        },
      ],
    },
  })
  const runs = [
    run("mixed.ts", [414, 768]),
    run("unknown.ts", [null]),
    run("empty.ts", []),
    run("empty.ts", [414]),
  ]
  for (const mobile of [false, true]) {
    assert.equal(captureRunMatchesMode(runs[2], "empty.ts", mobile), true)
    assert.deepEqual(
      captureFiles(files).map((file) => file.path),
      ["mixed.ts", "unknown.ts", "empty.ts"],
    )
  }
})

test("워크트리 테스트 코드는 전체 코드 전환 없이 변경 구간만 표시한다", async () => {
  await i18n.changeLanguage("en")
  const { UnitTests } = await server.ssrLoadModule("/src/components/unit-tests.tsx")
  render(
    createElement(UnitTests, {
      worktreeId: "w",
      api: {
        unitTests: async () => ({
          settings: { cwd: ".", command: "pnpm test", patterns: ["*.test.ts"] },
          catalog: {
            baseRevision: "base",
            diagnostics: [],
            files: [{ path: "unit.test.ts", source: "// header\n// new\n" }],
          },
          runs: [],
        }),
        gitDiff: async () => ({
          available: true,
          baseRevision: "base",
          omitted: [],
          patch:
            "diff --git a/unit.test.ts b/unit.test.ts\n--- a/unit.test.ts\n+++ b/unit.test.ts\n@@ -2 +2 @@\n-// old\n+// new\n",
        }),
      },
    }),
  )
  await screen.findByText(sourceLine("// new"))
  assert.ok(
    !screen.queryByRole("tab", { name: "Full code", exact: true }),
    "전체 코드 전환이 없어야 한다",
  )
  assert.ok(
    !screen.queryByRole("tab", { name: "Changes", exact: true }),
    "단일 보기는 전환 탭이 없어야 한다",
  )
  assert.equal(screen.queryByText(sourceLine("// header")), null)
  await screen.findByText(sourceLine("// old"))
})

test("변경 내역이 누락되거나 기준이 달라도 전체 원문을 노출하지 않는다", async () => {
  await i18n.changeLanguage("en")
  const { TestCode } = await server.ssrLoadModule("/src/components/test-code.tsx")
  for (const result of [
    { available: false, reason: "Unavailable", patch: "", omitted: [] },
    {
      available: true,
      baseRevision: "base",
      patch: "",
      omitted: ["unit.test.ts: diff size limit"],
    },
    {
      available: true,
      baseRevision: "changed-base",
      patch:
        "diff --git a/unit.test.ts b/unit.test.ts\n--- a/unit.test.ts\n+++ b/unit.test.ts\n@@ -1 +1 @@\n-old\n+new\n",
      omitted: [],
    },
  ]) {
    const rendered = render(
      createElement(TestCode, {
        api: { gitDiff: async () => result },
        worktreeId: "w",
        scope: "changed",
        baseRevision: "base",
        source: { path: "unit.test.ts", content: "// complete source" },
      }),
    )
    await screen.findByText("Changes unavailable.")
    assert.equal(screen.queryByText(sourceLine("// complete source")), null)
    assert.equal(document.querySelectorAll(".diff-code-insert, .diff-code-delete").length, 0)
    rendered.unmount()
  }
})

test("프로젝트 전체 테스트 코드는 Git 비교 없이 원문을 보여준다", async () => {
  const { TestCode } = await server.ssrLoadModule("/src/components/test-code.tsx")
  let reads = 0
  render(
    createElement(TestCode, {
      api: {
        gitDiff: async () => {
          reads++
          throw new Error("Unexpected comparison")
        },
      },
      worktreeId: "w",
      scope: "all",
      source: { path: "unit.test.ts", content: "// project source" },
    }),
  )
  await screen.findByText(sourceLine("// project source"))
  assert.equal(reads, 0)
  assert.ok(
    !screen.queryByRole("tab", { name: "Changes", exact: true }),
    "단일 보기는 전환 탭이 없어야 한다",
  )
})

test("헤더는 과거 제출이 있어도 존재 여부만 조회하고 빈 Integration을 숨긴다", async () => {
  const { reviewContent } = await server.ssrLoadModule("/src/lib/review-content.ts")
  const calls = []
  const expected = { preview: false, unit: false, tests: false, log: true, environment: false }
  const api = new Proxy(
    {
      reviewContent: async () => {
        calls.push("summary")
        return expected
      },
    },
    {
      get(target, key) {
        return (
          target[key] ??
          (() => {
            calls.push(key)
            throw new Error("상세 조회 금지")
          })
        )
      },
    },
  )
  assert.deepEqual(await reviewContent(api, "worktree", new AbortController().signal), expected)
  assert.deepEqual(calls, ["summary"])
})

test("헤더 판정이 끝나기 전에 빈 Diff에서 상세 패널로 자동 이동하지 않는다", async () => {
  const { WorktreeReview } = await server.ssrLoadModule("/src/components/worktree-review.tsx")
  const { act } = await import("react")
  let complete
  let details = 0
  await i18n.changeLanguage("en")
  const api = {
    reviewContent: () =>
      new Promise((resolve) => {
        complete = resolve
      }),
    gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
    playwright: async () => {
      details++
      return { settings: null, runs: [] }
    },
    worktreePlaywrightCatalog: async () => {
      details++
      return { files: [], diagnostics: [] }
    },
    mergeInspection: async () => ({ source: { files: [] }, target: null, records: [] }),
  }
  render(createElement(WorktreeReview, { api, worktreeId: "pending" }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  assert.equal(screen.queryAllByRole("tab").length, 0, "조회가 끝나기 전에는 탭을 노출하지 않는다")
  assert.equal(details, 0)
  await act(async () =>
    complete({ preview: false, unit: false, tests: false, log: false, environment: false }),
  )
  await waitFor(() => assert.equal(screen.queryAllByRole("tab").length, 0))
  assert.equal(details, 0)
})

test("Git 상대 경로 프로젝트의 Test는 서버가 해석한 기본 경로를 사용한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const reads = []
  render(
    createElement(ProjectManager, {
      initialProjects: [project],
      api: {
        ...sampleApi(),
        unitTests: async (id, _signal, scope) => {
          reads.push([id, scope])
          return { settings: null, catalog: { files: [], diagnostics: [] }, runs: [] }
        },
      },
    }),
  )
  await userEvent.setup().click(await screen.findByRole("button", { name: "Tests", exact: true }))
  await waitFor(() => assert.deepEqual(reads, [["example-worktree", "all"]]))
  assert.equal(screen.queryByText("Project checkout unavailable."), null)
})

test("캡처 소스는 실행 전에도 파일 선택과 실행 대상으로 남는다", async () => {
  await i18n.changeLanguage("en")
  const { CaptureReview } = await server.ssrLoadModule("/src/components/capture-review.tsx")
  const calls = []
  render(
    createElement(CaptureReview, {
      worktreeId: "w",
      api: {
        playwright: async () => ({
          settings: { targets: { screens: { purpose: "capture" } } },
          runs: [],
        }),
        worktreePlaywrightCatalog: async () => ({
          files: [{ path: "draft.ts", target: "screens", purpose: "capture" }],
          diagnostics: [],
        }),
        runPlaywright: async (...args) => {
          calls.push(args)
          throw new Error("Request recorded")
        },
      },
    }),
  )
  await screen.findByRole("treeitem", { name: "draft.ts", exact: true })
  await screen.findByText("No captures yet. Run Playwright to record the actual application.")
  const user = userEvent.setup()
  await user.click(screen.getByRole("switch", { name: "Mobile" }))
  assert.ok(screen.getByRole("treeitem", { name: "draft.ts", exact: true }))
  const run = screen.getByRole("button", { name: "Run Playwright", exact: true })
  assert.equal(run.disabled, false)
  await user.click(run)
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], ["w", undefined, { width: 390, height: 844 }, "screens"])
})

test("공유 파일 뷰어가 SVG 미리보기·원본 전환과 PNG·ICO 오류를 동일하게 제공한다", async () => {
  await i18n.changeLanguage("en")
  const { FileContent } = await server.ssrLoadModule("/src/components/file-content.tsx")
  const { fireEvent } = await import("@testing-library/react")
  const content = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  const view = render(
    createElement(FileContent, {
      entry: {
        kind: "image",
        path: "icon.svg",
        content,
        dataUrl: `data:image/svg+xml,${encodeURIComponent(content)}`,
      },
    }),
  )
  assert.ok(screen.getByRole("img", { name: "icon.svg" }))
  assert.equal(document.querySelector("script"), null)
  await userEvent.click(screen.getByRole("tab", { name: "Source" }))
  assert.ok(screen.getByText(sourceLine(content)))
  await userEvent.click(screen.getByRole("tab", { name: "Preview" }))
  assert.ok(screen.getByRole("img", { name: "icon.svg" }))
  for (const path of ["picture.png", "favicon.ico"]) {
    view.rerender(
      createElement(FileContent, {
        entry: { kind: "image", path, dataUrl: "data:image/png;base64,broken" },
      }),
    )
    assert.ok(screen.getByRole("img", { name: path }))
    assert.equal(screen.queryByRole("tab", { name: "Source" }), null)
    fireEvent.error(screen.getByRole("img", { name: path }))
    assert.ok(screen.getByText("This image could not be decoded."))
  }
})

test("커밋·브랜치 이미지 뷰어가 비교 리비전과 이름 변경 전 경로를 유지한다", async () => {
  await i18n.changeLanguage("en")
  const { FileDiff } = await server.ssrLoadModule("/src/components/image-diff.tsx")
  const { parseDiff } = await import("react-diff-view")
  const [file] = parseDiff(
    "diff --git a/old.svg b/new.svg\nsimilarity index 95%\nrename from old.svg\nrename to new.svg\n--- a/old.svg\n+++ b/new.svg\n@@ -1 +1 @@\n-<svg/>\n+<svg></svg>\n",
  )
  const calls = []
  render(
    createElement(FileDiff, {
      file,
      projectId: "p",
      before: "a".repeat(40),
      after: "b".repeat(40),
      api: {
        committedImage: async (id, query) => {
          calls.push([id, query])
          return { before: null, after: { dataUrl: "data:image/svg+xml,%3Csvg/%3E" } }
        },
      },
    }),
  )
  await waitFor(() => assert.ok(screen.getByRole("img", { name: "After: new.svg" })))
  assert.deepEqual(calls, [
    ["p", { path: "new.svg", oldPath: "old.svg", before: "a".repeat(40), after: "b".repeat(40) }],
  ])
  await userEvent.click(screen.getByRole("tab", { name: "Source" }))
  assert.ok(document.querySelector(".diff-code-delete"))
})

test("새 버전이 있을 때 사이드바 하단에 Update를 표시하고 네이티브 설치를 요청한다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const calls = []
  window.__TAURI__ = {
    core: {
      invoke: async (command) => {
        calls.push(command)
        return { version: "0.2.0", busy: false }
      },
    },
  }
  try {
    render(createElement(ProjectManager, { api: sampleApi(), initialProjects: [project] }))
    const update = await screen.findByRole("button", { name: "Update to 0.2.0" })
    assert.ok(update.closest('[data-slot="sidebar-footer"]'))
    await userEvent.click(update)
    await waitFor(() => assert.ok(calls.includes("desktop_install_update")))
  } finally {
    delete window.__TAURI__
  }
})

test("브라우저에서는 Update를 숨기고 데스크톱에서는 새 버전이 없어도 확인할 수 있다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const props = { api: sampleApi(), initialProjects: [project] }
  const view = render(createElement(ProjectManager, props))
  assert.equal(screen.queryByRole("button", { name: /Update/ }), null)
  view.unmount()
  let checked = false
  window.__TAURI__ = {
    core: {
      invoke: async () => {
        checked = true
        return { version: null, busy: false }
      },
    },
  }
  try {
    render(createElement(ProjectManager, props))
    await waitFor(() => assert.equal(checked, true))
    assert.ok(screen.getByRole("button", { name: "Check for updates" }))
  } finally {
    delete window.__TAURI__
  }
})

test("업데이트 작업 중에는 중복 설치 요청을 막는다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const calls = []
  window.__TAURI__ = {
    core: {
      invoke: async (command) => {
        calls.push(command)
        return { version: "0.2.0", busy: true }
      },
    },
  }
  try {
    render(createElement(ProjectManager, { api: sampleApi(), initialProjects: [project] }))
    const update = await screen.findByRole("button", { name: "Update to 0.2.0" })
    assert.equal(update.disabled, true)
    await userEvent.click(update)
    assert.deepEqual(calls, ["desktop_update_status"])
  } finally {
    delete window.__TAURI__
  }
})

test("사이드바 하단 한 줄에 아이콘 설정과 GitHub·Star·업데이트 확인을 모은다", async () => {
  await i18n.changeLanguage("en")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { sampleApi, project } = await server.ssrLoadModule("/test/workspace-fixture.mjs")
  const calls = []
  window.__TAURI__ = {
    core: {
      invoke: async (command) => {
        calls.push(command)
        return { version: null, busy: false }
      },
    },
  }
  try {
    render(createElement(ProjectManager, { api: sampleApi(), initialProjects: [project] }))
    const shortcuts = within(screen.getByRole("group", { name: "App shortcuts" }))
    const settings = shortcuts.getByRole("button", { name: "Settings", exact: true })
    assert.equal(settings.textContent, "")
    const repository = shortcuts.getByRole("link", { name: "GitHub repository" })
    const star = shortcuts.getByRole("link", { name: "Star on GitHub" })
    assert.equal(repository.getAttribute("href"), "https://github.com/wo658/redpact")
    assert.equal(star.getAttribute("href"), "https://github.com/wo658/redpact")
    await userEvent.click(repository)
    await userEvent.click(star)
    assert.equal(calls.filter((command) => command === "desktop_open_repository").length, 2)
    await userEvent.click(shortcuts.getByRole("button", { name: "Check for updates" }))
    await waitFor(() => assert.ok(calls.includes("desktop_install_update")))
    await userEvent.click(settings)
    assert.equal(settings.getAttribute("aria-current"), "page")
  } finally {
    delete window.__TAURI__
  }
})
