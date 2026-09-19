import assert from "node:assert/strict"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
test("프로젝트 사이드바에 Container 메뉴를 표시한다", async () => {
  const { WorktreeSidebar } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { SidebarProvider } = await server.ssrLoadModule("/src/components/ui/sidebar.tsx")
  const doc = new JSDOM(
    renderToStaticMarkup(
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
          onTestContainer() {},
          testContainerActive: true,
        }),
      ),
    ),
  ).window.document
  const button = [...doc.querySelectorAll("button")].find(
    (node) => node.textContent === "Container",
  )
  assert.ok(button)
  assert.equal(button.getAttribute("aria-current"), "page")
})

test("변경 표시와 실행 제어는 유지하고 상시 운영 안내는 표시하지 않는다", async () => {
  const { TestContainerView } = await server.ssrLoadModule(
    "/src/components/project-test-container.tsx",
  )
  const target = { id: "w", branch: "main", projectRoot: "/repo" }
  function render(data) {
    return new JSDOM(
      renderToStaticMarkup(
        createElement(TestContainerView, {
          data: { composeFiles: [], ...data },
          pending: false,
          error: "",
          onAction() {},
        }),
      ),
    ).window.document
  }
  const environment = {
    state: "ready",
    target: { projectRoot: "/repo" },
    errors: [],
    endpoints: { "app:3000": { host: "127.0.0.1", port: 41234 } },
    specification: { tests: { env: { APP_URL: { service: "app", port: 3000, scheme: "http" } } } },
  }
  const doc = render({ target, environment, changed: true, issue: null })
  assert.match(doc.body.textContent, /Local changes available/)
  assert.doesNotMatch(
    doc.body.textContent,
    /Runs a snapshot|Restart and Stop remove|Uses the project/,
  )
  assert.equal(doc.querySelector("a").href, "http://127.0.0.1:41234/")
  const unavailable = render({
    target: null,
    environment,
    changed: null,
    issue: "The main branch has no available worktree.",
  })
  const buttons = [...unavailable.querySelectorAll("button")]
  assert.equal(
    buttons.find((button) => button.textContent === "Restart with latest code").disabled,
    true,
  )
  assert.equal(buttons.find((button) => button.textContent === "Stop").disabled, false)
})

test("워크트리 환경 목록에서도 수동 컨테이너를 자동 테스트 실행으로 표시하지 않는다", async () => {
  const { EnvironmentRow } = await server.ssrLoadModule("/src/components/environment-row.tsx")
  const html = renderToStaticMarkup(
    createElement(EnvironmentRow, {
      api: {},
      onChange() {},
      environment: {
        id: "manual",
        lifecycle: "manual",
        state: "ready",
        createdAt: "2026-09-16T00:00:00Z",
        endpoints: {},
        errors: [],
      },
    }),
  )
  assert.match(html, /Container/)
  assert.doesNotMatch(html, /Automatic/)
})

test("Container의 새 화면 문구는 영문과 한국어 카탈로그에 모두 존재한다", async () => {
  const { readFile } = await import("node:fs/promises")
  const { en } = await import("../src/locales/en.ts")
  const { ko } = await import("../src/locales/ko.ts")
  const source = await readFile(
    new URL("../src/components/project-test-container.tsx", import.meta.url),
    "utf8",
  )
  for (const [, key] of source.matchAll(/\bt\("([^"]+)"\)/g)) {
    assert.ok(Object.hasOwn(en, key), `English: ${key}`)
    assert.ok(Object.hasOwn(ko, key), `Korean: ${key}`)
  }
})

test("Compose 파일을 정렬된 목록으로 표시하고 상세 정보와 코드 폴더를 생략한다", async () => {
  const { TestContainerView } = await server.ssrLoadModule(
    "/src/components/project-test-container.tsx",
  )
  const doc = new JSDOM(
    renderToStaticMarkup(
      createElement(TestContainerView, {
        data: {
          target: { branch: "local", projectRoot: "/repo" },
          composeFiles: ["compose.yaml", "compose.dev.yaml"],
          environment: null,
          changed: null,
          issue: null,
        },
        pending: false,
        error: "",
        onAction() {},
      }),
    ),
  ).window.document
  const rows = [...doc.querySelectorAll("dl > div")]
  const compose = rows.find((row) => row.querySelector("dt")?.textContent === "Compose files")
  assert.ok(compose)
  assert.match(compose.textContent, /compose.yaml/)
  assert.match(compose.textContent, /compose.dev.yaml/)
  assert.equal(doc.querySelector("details"), null)
  assert.doesNotMatch(doc.body.textContent, /\/repo/)
  assert.equal(compose.querySelectorAll("ul > li").length, 2)
  assert.deepEqual(
    [...compose.querySelectorAll("button")].map((button) => button.textContent),
    ["compose.yaml", "compose.dev.yaml"],
  )
  assert.equal(doc.querySelectorAll("dl").length, 1)
})
