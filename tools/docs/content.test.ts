import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"

const root = resolve(import.meta.dirname, "../..")
const directory = resolve(root, "docs")

test("the website consumes the only documentation directory", () => {
  assert.equal(existsSync(resolve(root, "app/docs")), false, "renderer belongs to redpact-web")
  assert.equal(existsSync(resolve(directory, "public")), false, "no separate public copy")
  assert.equal(
    existsSync(resolve(root, "DECISIONS.md")),
    false,
    "decisions live with their subject",
  )
  assert.equal(existsSync(resolve(directory, "HANDOFF.md")), false, "history belongs in Git")
})

test("every documentation page has both languages and is in website navigation", () => {
  const files = readdirSync(directory).filter((file) => file.endsWith(".md"))
  const slugs = files.filter((file) => !file.endsWith(".ko.md")).map((file) => file.slice(0, -3))
  assert.ok(slugs.length > 0)
  for (const language of ["en", "ko"]) {
    const meta = JSON.parse(readFileSync(resolve(directory, `meta.${language}.json`), "utf8"))
    const pages = meta.pages.filter((page: string) => !page.startsWith("---"))
    assert.deepEqual(
      [...pages].sort(),
      [...slugs].sort(),
      `${language}: no hidden or duplicate pages`,
    )
    for (const slug of slugs) {
      assert.match(slug, /^[a-z][a-z-]*$/)
      const name = `${slug}${language === "ko" ? ".ko" : ""}.md`
      assert.ok(files.includes(name), `${name}: translation required`)
      const source = readFileSync(resolve(directory, name), "utf8")
      assert.match(source, /^---\ntitle: .+\ndescription: .+\n---\n/, `${name}: page metadata`)
    }
  }
  assert.equal(files.length, slugs.length * 2, "no orphan translations")
})

test("documentation relative links resolve to maintained files", () => {
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".md"))) {
    const source = readFileSync(resolve(directory, name), "utf8").replace(/```[\s\S]*?```/g, "")
    for (const [, href] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) {
        continue
      }
      const path = href.split("#")[0]
      assert.ok(existsSync(resolve(directory, path)), `${name}: missing ${href}`)
    }
  }
})
