import assert from "node:assert/strict"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" })
after(() => server.close())

test("Korean mode translates the live connection screen", async () => {
  const locales = await server.ssrLoadModule("/src/locales/index.ts")
  if (locales.i18n) {
    await locales.i18n.changeLanguage("ko")
  }
  const { default: App } = await server.ssrLoadModule("/src/App.tsx")
  const html = renderToStaticMarkup(createElement(App))
  assert.match(html, /로컬 Redpact에 연결 중/)
  assert.match(html, /한국어/)
  const control = new JSDOM(html).window.document.querySelector(
    '[role="combobox"][aria-label="언어"]',
  )
  assert.ok(control)
})

test("switching en ↔ ko updates live controls and keeps server evidence verbatim", async () => {
  const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
  const { ProjectManager } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { TestEvidence } = await server.ssrLoadModule("/src/components/test-observation.tsx")
  const submission = {
    id: "submission-123",
    digest: "abc123",
    parsed: [],
    files: [{ path: "src/checkout.test.ts", source: 'expect("<customer>").toBe("paid")' }],
  }
  const run = {
    state: "finished",
    limitations: ["Original server limitation"],
    result: {
      outcome: "assertion_failed",
      cases: [],
      errors: ["Original assertion error <customer>"],
    },
  }
  for (const language of ["en", "ko", "en"]) {
    await i18n.changeLanguage(language)
    const html = renderToStaticMarkup(
      createElement(ProjectManager, { api: {}, initialProjects: [] }),
    )
    assert.ok(html.includes(language === "ko" ? "프로젝트 폴더 열기" : "Open project folder"))
    const picker = new JSDOM(html).window.document.querySelector('[role="radiogroup"]')
    assert.equal(picker, null)
    const evidence = renderToStaticMarkup(createElement(TestEvidence, { submission, run }))
    assert.ok(evidence.includes(language === "ko" ? "assertion 실패" : "assertion_failed"))
    assert.ok(evidence.includes(i18n.t("Executed source")))
    assert.ok(evidence.includes("Original assertion error"))
    assert.ok(evidence.includes("&lt;customer&gt;"))
    assert.ok(!evidence.includes("<customer>"))
  }
})

test("catalogs cover the same keys and interpolation values in both languages", async () => {
  const { i18n, resources } = await server.ssrLoadModule("/src/locales/index.ts")
  const en = resources.en.translation
  const ko = resources.ko.translation
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort())
  const variables = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort()
  for (const key of Object.keys(en)) {
    assert.ok(ko[key].trim(), key)
    assert.deepEqual(variables(ko[key]), variables(en[key]), key)
  }
  await i18n.changeLanguage("ko")
  for (const count of [0, 1, 2]) {
    assert.equal(i18n.t("fileCount", { count }), `파일 ${count}개`)
    assert.equal(i18n.t("worktreeCount", { count }), `worktree ${count}개`)
    assert.equal(i18n.t("localProjects", { count }), `로컬 프로젝트 ${count}개`)
    assert.equal(i18n.t("endpointCount", { count }), `endpoint ${count}개`)
  }
  assert.equal(
    i18n.t("Open {{project}} {{worktree}}", { project: "<project>", worktree: "feature/cart" }),
    "<project> feature/cart 열기",
  )
  await i18n.changeLanguage("fr")
  assert.equal(i18n.t("Language"), "Language")
  await i18n.changeLanguage("en")
})

test("saved choice wins, regional browser languages resolve, and blocked storage is harmless", async () => {
  const { i18n, preferredLanguage, languageStorageKey } =
    await server.ssrLoadModule("/src/locales/index.ts")
  const names = ["window", "document", "navigator", "localStorage"]
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  const values = new Map()
  const document = { documentElement: { lang: "en" } }
  const define = (name, value) =>
    Object.defineProperty(globalThis, name, { configurable: true, value })
  try {
    define("window", {})
    define("document", document)
    define("navigator", { languages: ["fr-FR", "ko-KR", "en-US"] })
    define("localStorage", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    })
    assert.equal(preferredLanguage(), "ko")
    await i18n.changeLanguage("en")
    assert.equal(values.get(languageStorageKey), "en")
    assert.equal(preferredLanguage(), "en")
    await i18n.changeLanguage("ko")
    assert.equal(document.documentElement.lang, "ko")
    assert.equal(preferredLanguage(), "ko")
    values.set(languageStorageKey, "invalid")
    define("navigator", { languages: ["de-DE"] })
    assert.equal(preferredLanguage(), "en")
    define("navigator", { languages: ["en-GB", "ko-KR"] })
    assert.equal(preferredLanguage(), "en")
    define("localStorage", {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    })
    await i18n.changeLanguage("ko")
    assert.equal(i18n.t("Language"), "언어")
    assert.equal(document.documentElement.lang, "ko")
    assert.equal(preferredLanguage(), "en")
  } finally {
    names.forEach((name, index) => {
      if (descriptors[index]) {
        Object.defineProperty(globalThis, name, descriptors[index])
      } else {
        delete globalThis[name]
      }
    })
    await i18n.changeLanguage("en")
  }
})

test("shared UI default accessibility text follows Korean mode", async () => {
  const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
  const { SidebarProvider, SidebarTrigger } = await server.ssrLoadModule(
    "/src/components/ui/sidebar.tsx",
  )
  const { Combobox, ComboboxTrigger } = await server.ssrLoadModule(
    "/src/components/ui/combobox.tsx",
  )
  await i18n.changeLanguage("ko")
  const sidebar = renderToStaticMarkup(
    createElement(SidebarProvider, null, createElement(SidebarTrigger)),
  )
  assert.match(sidebar, /사이드바 전환/)
  const combobox = renderToStaticMarkup(
    createElement(Combobox, null, createElement(ComboboxTrigger)),
  )
  assert.match(combobox, /선택 항목 열기/)
  await i18n.changeLanguage("en")
})

test("Korean developer vocabulary preserves technical terms and readable guidance", async () => {
  const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
  await i18n.changeLanguage("ko")
  try {
    const labels = {
      Changes: "Diff",
      Tests: "Test",
      Worktree: "Worktree",
      Branch: "Branch",
      Dependencies: "Dependencies",
      "Per-environment": "환경별 실행",
      "Shared local": "로컬 공용",
      Mock: "모의 실행",
      "Remote connection": "원격 연결",
      "Not assessed": "Not assessed",
      "Mode configured": "Mode configured",
      Assertions: "Assertions",
      "Stack trace": "Stack trace",
      "Base ref": "Base ref",
      "Staged · HEAD → index": "Staged · HEAD → index",
      "Unstaged · index → working tree": "Unstaged · index → working tree",
      "Environment overrides": "env override",
      key: "key",
      value: "value",
    }
    for (const [key, label] of Object.entries(labels)) {
      assert.equal(i18n.t(key), label, key)
    }
    assert.equal(i18n.t("Loading tests…"), "test를 불러오는 중…")
    assert.equal(i18n.t("Git diff unavailable"), "Git diff를 불러올 수 없습니다")
    assert.equal(i18n.t("Settings"), "Settings")
    assert.equal(i18n.t("Retry connection"), "다시 연결")
  } finally {
    await i18n.changeLanguage("en")
  }
})
