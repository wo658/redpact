import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

test("brand assets are registered in the viewer", () => {
  const root = new URL("../public/", import.meta.url)
  for (const path of [
    "brand/wordmark.svg",
    "brand/icon.svg",
    "brand/icon.png",
    "favicon.ico",
    "apple-touch-icon.png",
  ]) {
    assert.ok(existsSync(new URL(path, root)), `${path} must be registered`)
  }
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
  assert.match(html, /rel="apple-touch-icon"/)
  assert.match(html, /favicon.ico/)
})
