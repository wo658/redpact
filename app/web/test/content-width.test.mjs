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

test("tables share the 640, 768 and wide content policies without changing evidence", async () => {
  const { DataTable } = await server.ssrLoadModule("/src/components/data-table.tsx")
  for (const width of ["640", "768", "wide"]) {
    const value = `첫 번째 줄\n긴 값 ${"value".repeat(80)}`
    const doc = new JSDOM(
      renderToStaticMarkup(
        createElement(
          DataTable,
          { width, "aria-label": "Values" },
          createElement("tbody", null, createElement("tr", null, createElement("td", null, value))),
        ),
      ),
    ).window.document
    const region = doc.querySelector(`[data-table-width="${width}"]`)
    assert.ok(region.classList.contains(`content-width-${width}`))
    assert.equal(region.querySelector("td").textContent, value)
    assert.ok(
      region.querySelector('[data-slot="table-container"]').classList.contains("overflow-x-auto"),
    )
  }
})

test("content width policy leaves alignment, whitespace and scrolling to the caller", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8")
  assert.match(css, /--content-width-640:\s*40rem;/)
  assert.match(css, /--content-width-768:\s*48rem;/)
  for (const width of ["640", "768", "wide"]) {
    const rule = css.match(new RegExp(`\\.content-width-${width}\\s*\\{([^}]+)\\}`))?.[1]
    assert.ok(rule, `Missing width ${width}`)
    assert.match(
      rule,
      width === "wide"
        ? /max-width:\s*none/
        : new RegExp(`max-width:\\s*var\\(--content-width-${width}\\)`),
    )
    assert.doesNotMatch(rule, /overflow|white-space|margin|height/)
  }
  const settings = css.match(/\.settings-page\s*\{([^}]+)\}/)?.[1]
  assert.ok(settings)
  assert.match(settings, /max-width:\s*calc\(var\(--content-width-640\) \+ 3rem\)/)
  for (const name of ["project-settings", "project-manager"]) {
    const source = await readFile(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8")
    assert.match(source, /settings-page/)
    assert.doesNotMatch(source, /max-w-\[688px\]/)
  }
})
