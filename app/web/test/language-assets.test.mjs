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
  for (const [key, singular, plural] of [
    ["localProjects", "local project", "local projects"],
    ["worktreeCount", "worktree", "worktrees"],
    ["fileCount", "file", "files"],
    ["endpointCount", "endpoint", "endpoints"],
  ]) {
    assert.equal(i18n.t(key, { count: 0 }), `0 ${plural}`)
    assert.equal(i18n.t(key, { count: 1 }), `1 ${singular}`)
    assert.equal(i18n.t(key, { count: 2 }), `2 ${plural}`)
  }
  assert.equal(
    i18n.t("Open {{project}} {{worktree}}", { project: "orders", worktree: "feature/cart" }),
    "Open orders feature/cart",
  )
  assert.equal(
    i18n.t("{{base}} fork → worktree", { base: "release/next" }),
    "release/next fork → worktree",
  )
  assert.equal(i18n.t("{{minutes}}m ago", { minutes: 8 }), "8m ago")
})
