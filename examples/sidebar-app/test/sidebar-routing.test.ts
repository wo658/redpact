import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { expect, test, vi } from "vitest"

const sdk = vi.hoisted(() => ({ app: undefined as any, opened: "" }))
vi.mock("../../../app/web/node_modules/@modelcontextprotocol/ext-apps", () => ({
  App: class {
    ontoolresult?: (value: unknown) => void
    constructor() {
      sdk.app = this
    }
    async connect() {}
    getHostContext() {
      return { theme: "light" }
    }
    async callServerTool() {
      return { content: [] }
    }
    async openLink({ url }: { url: string }) {
      sdk.opened = url
    }
  },
}))
const require = createRequire(new URL("../../../app/web/package.json", import.meta.url))
const { JSDOM } = require("jsdom")
const { initialize } = await import("../../../app/web/src/lib/sidebar-runtime.js")

test("App은 정확한 검토 경로만 열고 새로고침과 외부 뷰어에도 같은 기록을 유지한다", async () => {
  const html = await readFile(new URL("../src/redpact/app.html", import.meta.url), "utf8")
  const dom = new JSDOM(html, { url: "https://app.example/" })
  for (const name of [
    "window",
    "document",
    "HTMLElement",
    "HTMLTemplateElement",
    "PopStateEvent",
  ]) {
    vi.stubGlobal(name, dom.window[name])
  }
  let navigations = 0
  dom.window.addEventListener("popstate", () => navigations++)
  try {
    await initialize(() => () => {})
    const path = "/?page=review&kind=unit&id=8c9a6d6b-30f8-4e31-a476-5a494d449bdc"
    sdk.app.ontoolresult({ _meta: { reviewPath: path } })
    expect(dom.window.location.pathname + dom.window.location.search).toBe(path)
    expect(navigations).toBe(1)
    for (const reviewPath of [
      "https://evil.example/",
      "//evil.example/",
      "/?page=history",
      `${path}&next=https://evil.example`,
      path.replace("kind=unit", "kind=shell"),
      path.replace("8c9a6d6b-30f8-4e31-a476-5a494d449bdc", "../other"),
    ]) {
      sdk.app.ontoolresult({ _meta: { reviewPath } })
      expect(dom.window.location.pathname + dom.window.location.search).toBe(path)
    }
    sdk.app.ontoolresult({
      _meta: {
        page: {
          status: {
            state: "running",
            origin: "http://127.0.0.1:54322",
            installation: { state: "installed" },
          },
          error: "",
        },
      },
    })
    expect(dom.window.location.search).toBe(path.slice(1))
    dom.window.document.getElementById("setup").shadowRoot.getElementById("viewer").click()
    expect(sdk.opened).toBe(`http://127.0.0.1:54322${path}`)
  } finally {
    dom.window.dispatchEvent(new dom.window.Event("pagehide"))
    dom.window.close()
    vi.unstubAllGlobals()
  }
})
