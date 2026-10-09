import assert from "node:assert/strict"
import { after, afterEach, beforeEach, test } from "node:test"
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
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
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
  assert.ok(screen.getByText("passed"), "결과 행은 그룹 제목과 별도로 자신의 판정을 표시한다")
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
      kind: "isolated",
      services: ["payments"],
      env: {
        app: {
          URL: "http://payments:8080",
          OLD_KEY: { unset: true },
          TOKEN: "actual-payment-token",
          EMPTY: "",
        },
      },
    },
    llm: {
      kind: "mock",
    },
  },
}

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

test("실행 기록에서 Unit, Integration, Playwright의 준비 단계를 구분한다", async () => {
  await i18n.changeLanguage("en")
  const { ExecutionProgress } = await server.ssrLoadModule("/src/components/execution-progress.tsx")
  render(
    createElement(
      "div",
      null,
      createElement(ExecutionProgress, {
        kind: "unit",
        run: {
          state: "running",
          createdAt: "2026-09-26T00:00:00.000Z",
          inputDigest: "digest",
          runtimeId: null,
          containerId: null,
          outcome: null,
        },
      }),
      createElement(ExecutionProgress, {
        kind: "integration",
        run: {
          state: "queued",
          createdAt: "2026-09-26T00:00:00.000Z",
          environmentId: "env",
          result: null,
        },
      }),
      createElement(ExecutionProgress, {
        kind: "playwright",
        run: {
          state: "running",
          createdAt: "2026-09-26T00:00:00.000Z",
          after: {
            state: "running",
            environmentId: "env",
            inputDigest: undefined,
            containerId: undefined,
          },
          outcome: undefined,
        },
      }),
    ),
  )
  assert.equal(
    screen.getByRole("status", { name: "Unit progress" }).textContent.includes("Checking Docker"),
    true,
  )
  assert.equal(
    screen
      .getByRole("status", { name: "Integration progress" })
      .textContent.includes("Preparing environment"),
    true,
  )
  assert.equal(
    screen
      .getByRole("status", { name: "Playwright progress" })
      .textContent.includes("Preparing environment"),
    true,
  )
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

for (const surface of ["executed", "mcp"]) {
  test(`${surface} 파일 보기는 원문과 줄 번호, 구문 강조를 공통으로 제공한다`, async () => {
    await i18n.changeLanguage("en")
    const path = "sample.test.ts"
    const source = 'const message = "<script>literal</script>"\nexpect(message).toBeDefined()\n'
    const submission = { id: "s", digest: "d", files: [{ path, source }], parsed: [] }
    let Component
    let props
    if (surface === "executed") {
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

test("Windows 창 버튼은 연결 중에도 작동하고 최대화 상태를 반영한다", async () => {
  await i18n.changeLanguage("en")
  document.documentElement.dataset.desktop = "windows"
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => new Promise(() => {})
  const calls = []
  let maximized = false
  window.__TAURI__ = {
    window: {
      getCurrentWindow: () => ({
        isMaximized: async () => maximized,
        minimize: async () => {
          calls.push("minimize")
        },
        toggleMaximize: async () => {
          calls.push("toggle")
          maximized = !maximized
        },
        close: async () => {
          calls.push("close")
        },
      }),
    },
  }
  try {
    const { default: App } = await server.ssrLoadModule("/src/App.tsx")
    render(createElement(App))
    const user = userEvent.setup({ document })
    await user.click(screen.getByRole("button", { name: "Minimize window", exact: true }))
    await user.click(screen.getByRole("button", { name: "Maximize window", exact: true }))
    await user.click(await screen.findByRole("button", { name: "Restore window", exact: true }))
    await user.click(screen.getByRole("button", { name: "Close window", exact: true }))
    assert.deepEqual(calls, ["minimize", "toggle", "toggle", "close"])
    maximized = true
    window.dispatchEvent(new Event("resize"))
    await screen.findByRole("button", { name: "Restore window", exact: true })
  } finally {
    globalThis.fetch = originalFetch
    delete window.__TAURI__
    delete document.documentElement.dataset.desktop
  }
})

for (const deletedProject of [false, true]) {
  test(`프로젝트 ${deletedProject ? "삭제 후에도" : "연결 없이도"} 직접 검토 링크의 보존 실행을 연다`, async () => {
    await i18n.changeLanguage("en")
    const { default: App } = await server.ssrLoadModule("/src/App.tsx")
    const href = `/?page=review&kind=unit&id=retained-run${deletedProject ? "&project=removed-project" : ""}`
    window.history.replaceState(null, "", href)
    const calls = []
    render(
      createElement(App, {
        api: {
          worktrees: async () => {
            throw new Error("보존 실행 검토는 다른 프로젝트의 checkout을 선택하면 안 된다")
          },
          reviewContext: async (kind, id) => {
            calls.push([kind, id])
            return {
              kind,
              id,
              executionId: id,
              intent: "Retained command",
              projectId: null,
              worktreeId: null,
              path: "/removed/checkout",
              state: "finished",
              outcome: "command_succeeded",
              cleanup: { state: "removed", issues: [] },
              approval: null,
              failures: [],
              failureCount: 0,
              evidence: [],
              evidenceCount: 0,
              reviewPath: href,
              freshness: { state: "unknown", reason: "Not compared" },
              humanAcceptance: "not_recorded",
            }
          },
          unitRun: async (id) => {
            assert.equal(id, "retained-run")
            return { stdout: "Retained command output", stderr: "" }
          },
        },
      }),
    )
    assert.ok(await screen.findByRole("heading", { name: "Retained command", exact: true }))
    assert.ok(await screen.findByText("Retained command output", { exact: true }))
    assert.ok(screen.getByText("/removed/checkout", { exact: true }))
    assert.deepEqual(calls, [["unit", "retained-run"]])
    assert.equal(window.location.pathname + window.location.search, href)
    assert.equal(screen.queryByRole("heading", { name: "Current work", exact: true }), null)
  })
}

test("실행 승인 전에 캡처된 명령과 입력 식별자를 보여주고 명시적인 클릭만 승인한다", async () => {
  await i18n.changeLanguage("en")
  const { ExecutionReview } = await server.ssrLoadModule("/src/components/execution-workspace.tsx")
  const calls = []
  const context = {
    kind: "unit",
    id: "request-one",
    intent: "pnpm test",
    executionId: null,
    projectId: "p",
    worktreeId: "w",
    path: "/repo/feature",
    state: "pending",
    outcome: null,
    createdAt: "2026-10-09T00:00:00Z",
    finishedAt: null,
    reviewPath: "/?page=review",
    approval: {
      state: "pending",
      policy: "ask",
      requestId: "request-one",
      revision: 7,
      preview: {
        command: "pnpm test",
        cwd: "app/server",
        dockerfile: "tests/Dockerfile",
        settingsDigest: "settings-digest",
        inputDigest: "input-digest",
      },
    },
    cleanup: { state: "not_started", issues: [] },
    failures: [],
    failureCount: 0,
    evidence: [],
    evidenceCount: 0,
    freshness: { state: "unknown", reason: "Not compared" },
    humanAcceptance: "not_recorded",
  }
  render(
    createElement(ExecutionReview, {
      api: {
        reviewContext: async () => context,
        approveExecutionReview: async (...args) => {
          calls.push(args)
        },
      },
      execution: { kind: "unit", id: "request-one" },
      onHistory() {},
    }),
  )
  assert.ok(await screen.findByRole("heading", { name: "Requested execution", exact: true }))
  assert.ok(screen.getByText("tests/Dockerfile", { exact: true }))
  assert.ok(screen.getByText("settings-digest", { exact: true }))
  assert.equal(calls.length, 0)
  await userEvent.click(screen.getByRole("button", { name: "Approve execution", exact: true }))
  await waitFor(() => assert.deepEqual(calls, [["unit", "request-one", 7, undefined]]))
})

test("Integration 승인 전에 저장된 앱 서비스를 보여주고 환경 승인 클릭만 전달한다", async () => {
  await i18n.changeLanguage("en")
  const { ExecutionReview } = await server.ssrLoadModule("/src/components/execution-workspace.tsx")
  const calls = []
  const context = {
    kind: "integration",
    id: "request-one",
    intent: "Integration tests",
    executionId: null,
    projectId: "p",
    worktreeId: "w",
    path: "/repo/feature",
    state: "pending",
    outcome: null,
    createdAt: "2026-10-09T00:00:00Z",
    finishedAt: null,
    reviewPath: "/?page=review",
    approval: {
      state: "pending",
      policy: "ask",
      requestId: "request-one",
      revision: 7,
      preview: {
        services: ["reviewed-app"],
        serviceCount: 1,
        dependencies: [],
        dependencyCount: 0,
        settingsDigest: "settings-digest",
        sourceDigest: "source-digest",
      },
    },
    cleanup: { state: "not_started", issues: [] },
    failures: [],
    failureCount: 0,
    evidence: [],
    evidenceCount: 0,
    freshness: { state: "unknown", reason: "Not compared" },
    humanAcceptance: "not_recorded",
  }
  render(
    createElement(ExecutionReview, {
      api: {
        reviewContext: async () => context,
        approveExecutionReview: async (...args) => {
          calls.push(args)
        },
      },
      execution: { kind: "integration", id: "request-one" },
      onHistory() {},
    }),
  )
  assert.ok(await screen.findByRole("heading", { name: "Requested execution", exact: true }))
  assert.ok(screen.getByText("reviewed-app", { exact: true }))
  assert.ok(screen.getByRole("heading", { name: "Services · 1", exact: true }))
  assert.ok(screen.getByText("settings-digest", { exact: true }))
  assert.equal(calls.length, 0)
  await userEvent.click(screen.getByRole("button", { name: "Approve environment", exact: true }))
  await waitFor(() => assert.deepEqual(calls, [["integration", "request-one", 7, "environment"]]))
})
