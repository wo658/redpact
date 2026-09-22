import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
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

test("project dependency viewer omits internal settings metadata", async () => {
  const source = await readFile(
    new URL("../src/components/dependency-viewer.tsx", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(
    source,
    /SettingsInformation|Readiness not checked|Settings identity|Compose files/,
  )
})

test("settings organize preferences and integrations into named sections", async () => {
  const { GlobalSettings } = await server.ssrLoadModule("/src/components/project-manager.tsx")
  const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
  await i18n.changeLanguage("en")
  const api = { instanceSettings() {}, githubConnection() {}, approvalPolicy() {} }
  const doc = new JSDOM(renderToStaticMarkup(createElement(GlobalSettings, { api }))).window
    .document
  const sections = [...doc.querySelectorAll('[data-slot="settings-section"]')]
  assert.deepEqual(
    sections.map((section) => section.querySelector("h2").textContent),
    ["Updates", "Preferences", "Integrations", "Automation", "Instance configuration"],
  )
  const preferences = sections.find(
    (section) => section.querySelector("h2").textContent === "Preferences",
  )
  assert.ok(preferences.querySelector('[role="combobox"][aria-label="Theme"]'))
  assert.ok(preferences.querySelector('[role="combobox"][aria-label="Language"]'))
  const configuration = sections.at(-1)
  assert.equal(configuration.closest('[data-slot="settings-row"]'), null)
  assert.ok(configuration.querySelector('[role="status"]'))
})
