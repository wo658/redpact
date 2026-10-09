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
  assert.match(html, /채팅에서 실행 기록을 여세요/)
  assert.doesNotMatch(html, /role="combobox"/)
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
    assert.equal(i18n.t("Open an execution from chat"), "채팅에서 실행 기록을 여세요")
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
