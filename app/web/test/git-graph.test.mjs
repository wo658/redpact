import assert from "node:assert/strict"
import { after, afterEach, test } from "node:test"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" })
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
const { createElement, act } = await import("react")
const { render, cleanup, screen, fireEvent, waitFor } = await import("@testing-library/react")
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
const oid = "a".repeat(40)
const page = {
  commits: [
    {
      oid,
      parents: [],
      kind: "commit",
      message: "<script>기능</script>",
      author: { name: "Kim" },
      authoredAt: "2026-09-10T00:00:00Z",
      committedAt: "2026-09-10T00:00:00Z",
    },
  ],
  refs: [{ name: "refs/heads/main", target: oid, kind: "head" }],
  hasMore: false,
}

test("프로젝트 사이드바에서 읽기 전용 실제 그래프 렌더러를 연다", async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json(url.includes("/git/graph") ? page : [])
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
  fireEvent.click(screen.getByRole("button", { name: "Git Graph" }))
  await waitFor(() => {
    const graph = document.querySelector("web-git-graph")
    assert.ok(graph?.shadowRoot?.textContent.includes("<script>기능</script>"))
    assert.equal(graph.shadowRoot.querySelector("script"), null)
  })
  assert.equal(
    screen.getByRole("button", { name: "Git Graph" }).getAttribute("aria-current"),
    "page",
  )
  assert.ok(calls.some(({ url }) => url.includes("/projects/p/git/graph")))
  assert.ok(calls.every(({ init }) => init.method === "GET"))
  assert.equal(screen.queryByRole("button", { name: "Go back" }), null)
})

test("그래프가 실패 후 재조회하고 앱 테마를 따르며 닫을 때 요청을 취소한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  let failed = true
  let signal
  const api = createApi(async (_url, init) => {
    signal = init.signal
    return failed
      ? Response.json({ error: "Git unavailable" }, { status: 500 })
      : Response.json(page)
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() =>
    assert.ok(
      document.querySelector("web-git-graph")?.shadowRoot.textContent.includes("Git unavailable"),
    ),
  )
  const graph = document.querySelector("web-git-graph")
  failed = false
  graph.refresh()
  await waitFor(() => assert.equal(graph.data.commits.length, 1))
  document.documentElement.classList.add("dark")
  await waitFor(() => assert.equal(graph.theme, "dark"))
  cleanup()
  assert.equal(signal.aborted, true)
  document.documentElement.classList.remove("dark")
})

test("파일 내역을 조회하지 않은 커밋을 변경 파일 없음으로 표시하지 않는다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const api = createApi(async () => Response.json(page))
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  const graph = document.querySelector("web-git-graph")
  await act(async () => graph.selectCommit(oid))
  assert.equal(graph.shadowRoot.querySelector(".inline-details"), null)
  assert.equal(graph.shadowRoot.textContent.includes("No file changes."), false)
})

const patch = (name, content) => `diff --git a/${name} b/${name}
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/${name}
@@ -0,0 +1 @@
+${content}
`

test("커밋을 선택하면 변경 파일을 나열하고 파일 선택으로 기존 diff를 전환한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const calls = []
  const api = createApi(async (url) => {
    calls.push(url)
    return Response.json(
      url.includes("/commits/")
        ? {
            available: true,
            revision: oid,
            patch: patch("one.txt", "first content") + patch("two.txt", "second content"),
            omitted: [],
          }
        : page,
    )
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  await act(async () => document.querySelector("web-git-graph").selectCommit(oid))
  await screen.findByRole("treeitem", { name: /two.txt/ })
  assert.ok(screen.getByText("first content"))
  fireEvent.click(screen.getByRole("treeitem", { name: /two.txt/ }))
  assert.ok(screen.getByText("second content"))
  assert.equal(screen.queryByText("first content"), null)
  assert.ok(calls.some((url) => url.includes(`/commits/${oid}/diff`)))
})

test("다른 커밋을 선택하면 이전 요청을 취소하고 늦은 응답을 무시한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const second = "b".repeat(40)
  let finishFirst
  let firstSignal
  const api = createApi(async (url, init) => {
    if (url.includes(`/commits/${oid}/`)) {
      firstSignal = init.signal
      return new Promise((resolve) => {
        finishFirst = resolve
      })
    }
    if (url.includes(`/commits/${second}/`)) {
      return Response.json({
        available: true,
        patch: patch("latest.txt", "latest content"),
        omitted: [],
      })
    }
    return Response.json({
      ...page,
      commits: [...page.commits, { ...page.commits[0], oid: second }],
    })
  })
  const view = render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 2))
  const graph = document.querySelector("web-git-graph")
  await act(async () => graph.selectCommit(oid))
  await act(async () => graph.selectCommit(second))
  assert.equal(firstSignal.aborted, true)
  await screen.findByText("latest content")
  await act(async () =>
    finishFirst(
      Response.json({ available: true, patch: patch("stale.txt", "stale content"), omitted: [] }),
    ),
  )
  assert.equal(screen.queryByText("stale content"), null)
  assert.ok(screen.getByText("latest content"))
  view.rerender(createElement(ProjectGitGraph, { api, projectId: "other" }))
  assert.equal(screen.queryByRole("region", { name: "Commit changes" }), null)
})

test("조회 실패는 재시도하고 빈 커밋과 텍스트 없는 변경을 구분한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  let state = "error"
  const api = createApi(async (url) => {
    if (!url.includes("/commits/")) {
      return Response.json(page)
    }
    if (state === "error") {
      return Response.json({ error: "Cannot read commit" }, { status: 500 })
    }
    return Response.json({
      available: true,
      patch:
        state === "empty"
          ? ""
          : `diff --git a/binary.dat b/binary.dat
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/binary.dat differ
`,
      omitted: [],
    })
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  await act(async () => document.querySelector("web-git-graph").selectCommit(oid))
  const retry = await screen.findByRole("button", { name: "Retry" })
  assert.equal(screen.queryByText("No changes in this comparison."), null)
  state = "empty"
  fireEvent.click(retry)
  await screen.findByText("No changes in this comparison.")
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  state = "binary"
  await act(async () => document.querySelector("web-git-graph").selectCommit(oid))
  await screen.findByText("No text hunks: binary content, an empty file, or a file mode change.")
  assert.ok(screen.getByRole("treeitem", { name: /binary.dat/ }))
})

test("파일 보기 높이를 키보드로 조절하고 다시 열어도 유지한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const api = createApi(async (url) =>
    Response.json(
      url.includes("/commits/")
        ? { available: true, patch: patch("one.txt", "content"), omitted: [] }
        : page,
    ),
  )
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  const graph = document.querySelector("web-git-graph")
  await act(async () => graph.selectCommit(oid))
  const handle = screen.getByRole("separator", { name: "Resize commit changes" })
  assert.equal(handle.getAttribute("aria-valuenow"), "50")
  const layout = handle.parentElement
  layout.getBoundingClientRect = () => ({ top: 0, height: 408 })
  let captured = false
  handle.setPointerCapture = () => {
    captured = true
  }
  handle.hasPointerCapture = () => captured
  handle.releasePointerCapture = () => {
    captured = false
  }
  window.PointerEvent = window.MouseEvent
  fireEvent.pointerDown(handle, { button: 0, clientY: 204 })
  fireEvent.pointerMove(handle, { clientY: 124 })
  assert.equal(handle.getAttribute("aria-valuenow"), "30")
  fireEvent.pointerUp(handle)
  fireEvent.pointerMove(handle, { clientY: 304 })
  assert.equal(handle.getAttribute("aria-valuenow"), "30")
  fireEvent.doubleClick(handle)
  fireEvent.keyDown(handle, { key: "ArrowUp" })
  assert.equal(handle.getAttribute("aria-valuenow"), "45")
  fireEvent.keyDown(handle, { key: "Home" })
  assert.equal(handle.getAttribute("aria-valuenow"), "20")
  fireEvent.keyDown(handle, { key: "End" })
  assert.equal(handle.getAttribute("aria-valuenow"), "80")
  await screen.findByText("content")
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  await act(async () => graph.selectCommit(oid))
  const reopened = screen.getByRole("separator", { name: "Resize commit changes" })
  assert.equal(reopened.getAttribute("aria-valuenow"), "80")
  fireEvent.doubleClick(reopened)
  assert.equal(reopened.getAttribute("aria-valuenow"), "50")
})

test("본문 있는 커밋도 확장 없이 행에서 전체 SHA를 복사한다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const api = createApi(async () =>
    Response.json({
      ...page,
      commits: [{ ...page.commits[0], message: "Subject\n\nAdditional context" }],
    }),
  )
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  const graph = document.querySelector("web-git-graph")
  await act(async () => graph.selectCommit(oid))
  assert.equal(graph.shadowRoot.querySelector(".inline-details"), null)
  const row = graph.shadowRoot.querySelector(`[data-oid="${oid}"]`)
  assert.equal(row.querySelector(".message").title, "Subject\n\nAdditional context")
  const copied = []
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => copied.push(value) },
  })
  const copy = row.querySelector('button[aria-label="Copy SHA"]')
  assert.ok(copy)
  assert.equal(copy.textContent, oid.slice(0, 8))
  fireEvent.click(copy)
  await waitFor(() => assert.deepEqual(copied, [oid]))
  assert.ok(graph.shadowRoot.querySelector(`[data-oid="${oid}"]`).classList.contains("selected"))
  assert.equal(graph.shadowRoot.querySelector(".inline-details"), null)
})

test("모든 커밋은 클릭과 키보드 선택에도 행을 확장하지 않는다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const second = "b".repeat(40)
  const third = "c".repeat(40)
  const api = createApi(async (url) =>
    Response.json(
      url.includes("/commits/")
        ? { available: true, patch: patch("one.txt", "content"), omitted: [] }
        : {
            ...page,
            commits: [
              ...page.commits,
              { ...page.commits[0], oid: second, message: "Subject\n  \n" },
              { ...page.commits[0], oid: third, message: "Subject\n\nBody" },
            ],
          },
    ),
  )
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 3))
  const graph = document.querySelector("web-git-graph")
  const root = graph.shadowRoot
  const height = root.querySelector(".spacer").style.height
  const selectRow = (id) => root.querySelector(`[data-oid="${id}"]`)
  fireEvent.click(selectRow(oid))
  await screen.findByText("content")
  assert.equal(root.querySelector(".inline-details"), null)
  assert.equal(root.querySelector(".spacer").style.height, height)
  await act(async () => graph.selectCommit(third))
  assert.equal(root.querySelector(".inline-details"), null)
  assert.equal(root.querySelector(".spacer").style.height, height)
  selectRow(second).focus()
  fireEvent.keyDown(selectRow(second), { key: "Enter" })
  assert.equal(root.querySelector(".inline-details"), null)
  assert.equal(root.querySelector(".spacer").style.height, height)
  assert.equal(selectRow(third).style.top, "48px")
  assert.ok(selectRow(second).classList.contains("selected"))
  fireEvent.contextMenu(selectRow(second))
  assert.ok(root.textContent.includes("Copy Commit Hash"))
})

test("Git graph를 열 때 Fetch를 자동 실행하지 않고 Pull·Push는 제공하지 않는다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json(page)
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  assert.ok(await screen.findByRole("button", { name: "Fetch" }))
  for (const action of ["Pull", "Push"]) {
    assert.equal(screen.queryByRole("button", { name: action }) === null, true)
  }
  assert.ok(calls.every(({ init }) => init.method === "GET"))
})

test("Fetch 중 중복 요청을 막고 성공·실패 모두 그래프를 다시 읽는다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  let finish
  let reads = 0
  let writes = 0
  const api = createApi(async (url) => {
    if (url.endsWith("/git/fetch")) {
      writes++
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    reads++
    return Response.json(page)
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  const button = await screen.findByRole("button", { name: "Fetch", exact: true })
  fireEvent.click(button)
  await waitFor(() => assert.equal(button.disabled, true))
  fireEvent.click(button)
  assert.equal(writes, 1)
  const previousReads = reads
  await act(async () => finish(Response.json({ remotes: ["origin"] })))
  await screen.findByText("Fetch complete")
  await waitFor(() => assert.ok(reads > previousReads))
  fireEvent.click(button)
  await act(async () =>
    finish(Response.json({ error: "No Git remotes configured" }, { status: 400 })),
  )
  await screen.findByText("No Git remotes configured")
  assert.equal(button.disabled, false)
  assert.equal(screen.queryByText("Fetch complete"), null)
})

test("새로고침은 GET으로 새 커밋을 표시하고 읽는 동안 중복 클릭을 막는다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  const requests = []
  let release
  const api = createApi(async (url, init) => {
    requests.push({ url, method: init.method })
    if (requests.length === 1) {
      return Response.json(page)
    }
    return new Promise((resolve) => {
      release = resolve
    })
  })
  render(createElement(ProjectGitGraph, { api, projectId: "p" }))
  const refresh = await screen.findByRole("button", { name: "Refresh", exact: true })
  await waitFor(() => assert.equal(refresh.disabled, false))
  fireEvent.click(refresh)
  await waitFor(() => assert.equal(refresh.disabled, true))
  fireEvent.click(refresh)
  assert.equal(requests.length, 2)
  await act(async () =>
    release(
      Response.json({
        ...page,
        commits: [{ ...page.commits[0], message: "새로 읽은 커밋" }],
      }),
    ),
  )
  await waitFor(() => {
    assert.equal(refresh.disabled, false)
    assert.ok(
      document.querySelector("web-git-graph").shadowRoot.textContent.includes("새로 읽은 커밋"),
    )
  })
  assert.ok(requests.every(({ url, method }) => method === "GET" && url.includes("/git/graph")))
})

test("그래프 내부 색상이 전용 토큰을 사용하고 테마 전환과 재조회 뒤에도 유지된다", async () => {
  const { ProjectGitGraph } = await server.ssrLoadModule("/src/components/project-git-graph.tsx")
  render(
    createElement(ProjectGitGraph, {
      api: createApi(async () => Response.json(page)),
      projectId: "p",
    }),
  )
  await waitFor(() => assert.equal(document.querySelector("web-git-graph")?.data.commits.length, 1))
  const graph = document.querySelector("web-git-graph")
  const styles = () => graph.shadowRoot.querySelector("style[data-redpact-theme]")
  assert.ok(styles(), "Shadow DOM 내부에 앱의 의미별 색상 스타일이 있어야 한다")
  const css = styles().textContent
  for (const token of [
    "--card",
    "--accent-foreground",
    "--destructive",
    "--primary-foreground",
    "--shadow-md",
    "--git-graph-blue",
    "--git-graph-pink",
    "--git-graph-on-lane",
  ]) {
    assert.ok(css.includes(`var(${token})`), token)
  }
  for (const node of graph.shadowRoot.querySelectorAll(".graph [stroke]")) {
    const color = node.getAttribute("stroke")
    if (color.startsWith("#")) {
      assert.ok(
        css.includes(`[stroke="${color}"]`),
        "모든 그래프 선 색상을 테마 토큰에 연결해야 한다",
      )
    }
  }
  document.documentElement.classList.add("dark")
  await waitFor(() => assert.equal(graph.theme, "dark"))
  await act(async () => graph.refresh())
  await waitFor(() => assert.equal(graph.data.commits.length, 1))
  assert.equal(styles().textContent, css)
  assert.equal(graph.shadowRoot.querySelectorAll("style[data-redpact-theme]").length, 1)
  document.documentElement.classList.remove("dark")
  await waitFor(() => assert.equal(graph.theme, "light"))
})
