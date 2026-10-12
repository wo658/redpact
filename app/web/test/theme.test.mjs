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
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "NodeFilter",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "localStorage",
]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
HTMLElement.prototype.scrollIntoView = () => {}
const listeners = new Set()
let systemDark = false
window.matchMedia = () => ({
  get matches() {
    return systemDark
  },
  addEventListener: (_, fn) => listeners.add(fn),
  removeEventListener: (_, fn) => listeners.delete(fn),
})
const { createElement } = await import("react")
const { render, cleanup, screen, act } = await import("@testing-library/react")
const { default: userEvent } = await import("@testing-library/user-event")
async function chooseTheme(name) {
  const user = userEvent.setup({ document })
  await user.click(screen.getByRole("combobox", { name: "Theme" }))
  await user.click(await screen.findByRole("option", { name, exact: true }))
}
const { createServer } = await import("vite")
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { i18n } = await server.ssrLoadModule("/src/locales/index.ts")
await i18n.changeLanguage("en")
afterEach(() => {
  cleanup()
  localStorage.clear()
  systemDark = false
  document.documentElement.className = ""
})
after(async () => {
  await server.close()
  dom.window.close()
})

async function mountTheme() {
  const { ThemeProvider } = await server.ssrLoadModule("/src/lib/theme.tsx")
  const { ThemeSettings } = await server.ssrLoadModule("/src/components/theme-settings.tsx")
  return render(createElement(ThemeProvider, null, createElement(ThemeSettings)))
}

test("다크 선택을 저장하고 다시 열어도 적용한다", async () => {
  await mountTheme()
  await chooseTheme("Dark")
  assert.equal(document.documentElement.classList.contains("dark"), true)
  assert.equal(document.documentElement.style.colorScheme, "dark")
  assert.equal(localStorage.getItem("redpact:theme"), "dark")
  cleanup()
  await mountTheme()
  assert.equal(screen.getByRole("combobox", { name: "Theme" }).value, "Dark")
})

test("시스템 모드는 운영체제 변경을 따르고 명시적 라이트는 유지한다", async () => {
  localStorage.setItem("redpact:theme", "system")
  systemDark = true
  await mountTheme()
  assert.equal(document.documentElement.classList.contains("dark"), true)
  await act(() => {
    systemDark = false
    for (const fn of listeners) {
      fn({ matches: false })
    }
  })
  assert.equal(document.documentElement.classList.contains("dark"), false)
  await chooseTheme("Light")
  await act(() => {
    systemDark = true
    for (const fn of listeners) {
      fn({ matches: true })
    }
  })
  assert.equal(document.documentElement.classList.contains("dark"), false)
  await chooseTheme("System")
  assert.equal(localStorage.getItem("redpact:theme"), "system")
  assert.equal(document.documentElement.classList.contains("dark"), true)
  cleanup()
  assert.equal(listeners.size, 0)
})

test("잘못된 저장값과 저장소 오류에도 테마를 전환한다", async () => {
  localStorage.setItem("redpact:theme", "invalid")
  await mountTheme()
  assert.equal(screen.getByRole("combobox", { name: "Theme" }).value, "System")
  cleanup()
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked")
    },
  })
  try {
    await mountTheme()
    await chooseTheme("Dark")
    assert.equal(document.documentElement.classList.contains("dark"), true)
  } finally {
    Object.defineProperty(window, "localStorage", descriptor)
  }
})
