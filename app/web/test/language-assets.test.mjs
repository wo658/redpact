import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { test } from "node:test"
import ts from "typescript"

const sourceRoot = new URL("../src/", import.meta.url)

test("application copy and accessibility labels live outside components", async () => {
  const paths = [
    "App.tsx",
    ...(await readdir(new URL("components/", sourceRoot)))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `components/${name}`),
  ]
  const { en } = await import("../src/locales/en.ts")
  const inlineCopy = []
  for (const path of paths) {
    const source = ts.createSourceFile(
      path,
      await readFile(new URL(path, sourceRoot), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.text.trim()
        if (/[a-zA-Z]/.test(text) && !["redpact", "TypeScript", "English"].includes(text)) {
          inlineCopy.push(`${path}: ${text}`)
        }
      }
      if (
        ts.isJsxAttribute(node) &&
        ["aria-label", "placeholder", "tooltip", "title"].includes(node.name.getText(source)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        inlineCopy.push(`${path}: ${node.initializer.text}`)
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text
        assert.ok(
          Object.hasOwn(en, key) || Object.hasOwn(en, `${key}_other`),
          `Missing catalog entry: ${key}`,
        )
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(inlineCopy, [], "Move UI copy into the English language asset")
})

test("English assets own counts and complete interpolated messages", async () => {
  const { createInstance } = await import("i18next")
  const { en } = await import("../src/locales/en.ts")
  const i18n = createInstance()
  await i18n.init({
    lng: "en",
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: en } },
  })
  for (const count of [0, 1, 2]) {
    assert.equal(i18n.t("fileCount", { count }), `${count} ${count === 1 ? "file" : "files"}`)
  }
  assert.equal(i18n.t("Copy log: {{name}}", { name: "Verification" }), "Copy log: Verification")
  assert.equal(i18n.t("{{seconds}}s elapsed", { seconds: 8 }), "8s elapsed")
})
