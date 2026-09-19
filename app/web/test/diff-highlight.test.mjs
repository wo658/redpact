import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { parseDiff } from "react-diff-view"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
const { UnifiedDiff } = await server.ssrLoadModule("/src/components/unified-diff.tsx")

const viewerCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")

function visibleGutters(dom, selector) {
  const style = dom.window.document.createElement("style")
  style.textContent = [...viewerCss.matchAll(/[^{}]*\.diff-source[^{}]*\{[^{}]*\}/g)]
    .map(([rule]) => rule)
    .join("\n")
  dom.window.document.head.append(style)
  return [...dom.window.document.querySelectorAll(selector)].filter(
    (node) => dom.window.getComputedStyle(node).display !== "none",
  )
}

function renderDiff(path, source, deleted = false) {
  const patch = `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-${source}
+${source}
`
  const [file] = parseDiff(patch)
  if (deleted) {
    file.newPath = "/dev/null"
    file.type = "delete"
  }
  return new JSDOM(renderToStaticMarkup(createElement(UnifiedDiff, { file })))
}

for (const [path, source] of [
  ["app.py", "def greet(): return 'hello'"],
  ["app.go", "package main"],
  ["app.rs", "fn main() {}"],
  ["App.java", "public class App {}"],
  ["app.rb", "def greet; end"],
  ["App.cs", "public class App {}"],
  ["app.cpp", "int main() { return 0; }"],
  ["app.swift", "let value = 1"],
  ["query.sql", "SELECT * FROM users;"],
  ["src/APP.PYI", "def greet() -> str: ..."],
  ["app.pyw", "import sys"],
  ["app.mts", "const value: number = 1"],
  ["app.cts", "const value: number = 1"],
  ["app.mjs", "const value = 1"],
  ["app.cjs", "const value = 1"],
  ["app.tsx", "const node = <div />"],
  ["app.zsh", "echo hello"],
  ["Dockerfile", "FROM node:24"],
  ["docker/Dockerfile.dev", "FROM node:24"],
  ["Makefile", "all: build"],
]) {
  test(`diff highlights ${path} while preserving source and changed rows`, () => {
    const dom = renderDiff(path, source)
    const doc = dom.window.document
    assert.ok(doc.querySelector(".diff-code .token"), `Missing syntax tokens for ${path}`)
    for (const kind of ["insert", "delete"]) {
      const code = doc.querySelector(`.diff-code-${kind}`)
      assert.equal(code.textContent, source)
      assert.ok(code.querySelector(".token"))
    }
    dom.window.close()
  })
}

for (const path of ["notes.unknown", "src.py/README", "go", "__proto__", "file.constructor"]) {
  test(`diff preserves unsupported ${path} as escaped plain text`, () => {
    const source = '<script>alert("hello")</script>'
    const dom = renderDiff(path, source)
    const doc = dom.window.document
    assert.equal(doc.querySelector(".diff-code .token"), null)
    assert.equal(doc.querySelector(".diff-code-insert").textContent, source)
    assert.equal(doc.querySelector("script"), null)
    dom.window.close()
  })
}

test("deleted Python files use their original path for highlighting", () => {
  const dom = renderDiff("app.py", "import sys", true)
  assert.ok(dom.window.document.querySelector(".diff-code .token.keyword"))
  dom.window.close()
})

for (const [path, content, lines] of [
  ["app.ts", "const value = 1\n\nconsole.log(value)\n", 3],
  ["notes.unknown", "<script>alert(1)</script>", 1],
  ["empty.txt", "", 0],
]) {
  test(`File Viewer가 ${path} 원문을 변경 표시 없이 공유 Diff에 표시한다`, () => {
    const dom = new JSDOM(
      renderToStaticMarkup(createElement(UnifiedDiff, { source: { path, content } })),
    )
    const doc = dom.window.document
    assert.equal(doc.querySelectorAll(".diff-code").length, lines)
    assert.equal(visibleGutters(dom, ".diff-gutter").length, lines)
    assert.equal(visibleGutters(dom, ".diff-gutter-col").length, lines ? 1 : 0)
    assert.deepEqual(
      visibleGutters(dom, ".diff-gutter").map((node) => node.textContent),
      Array.from({ length: lines }, (_, index) => String(index + 1)),
    )
    assert.equal(doc.querySelector(".diff-code-insert, .diff-code-delete, script"), null)
    assert.equal(doc.querySelector("[data-slot=badge]"), null)
    if (path === "app.ts") {
      assert.ok(doc.querySelector(".token.keyword"))
    }
    if (lines) {
      assert.equal(
        [...doc.querySelectorAll(".diff-code")].map((node) => node.textContent).join("\n"),
        // react-diff-view uses one display space to keep an empty line selectable.
        content
          .replace(/\n$/, "")
          .split("\n")
          .map((line) => line || " ")
          .join("\n"),
      )
    } else {
      assert.match(doc.body.textContent, /Empty file/)
    }
    dom.window.close()
  })
}

test("diff mode retains both line-number columns", () => {
  const [file] = parseDiff(`diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,2 +1,2 @@
 const kept = 1
-const old = 2
+const next = 3
`)
  const dom = new JSDOM(renderToStaticMarkup(createElement(UnifiedDiff, { file })))
  assert.equal(visibleGutters(dom, ".diff-gutter-col").length, 2)
  assert.deepEqual(
    visibleGutters(dom, ".diff-line:first-child .diff-gutter").map((node) => node.textContent),
    ["1", "1"],
  )
  dom.window.close()
})
