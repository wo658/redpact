import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { test } from "node:test"

const root = new URL("../", import.meta.url)

test("the UI registry uses Base UI Nova with only the Linear theme extension", async () => {
  const config = JSON.parse(await readFile(new URL("components.json", root), "utf8"))
  assert.equal(config.style, "base-nova")
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"))
  assert.ok(pkg.dependencies["@base-ui/react"])
  assert.equal(pkg.dependencies["radix-ui"], undefined)
})

test("application controls use the shared primitives except the specialist Git tree", async () => {
  const names = await readdir(new URL("src/components/", root))
  const custom = []
  for (const name of names.filter((name) => name.endsWith(".tsx"))) {
    if (name === "changed-file-list.tsx") {
      continue
    }
    const source = await readFile(new URL(`src/components/${name}`, root), "utf8")
    if (/<(?:select|button|details|summary|input|textarea|label)\b/.test(source)) {
      custom.push(name)
    }
  }
  const app = await readFile(new URL("src/App.tsx", root), "utf8")
  if (/<(?:select|button|details|summary|input|textarea|label)\b/.test(app)) {
    custom.push("App.tsx")
  }
  assert.deepEqual(custom, [])
  for (const name of await readdir(new URL("src/components/ui/", root))) {
    const source = await readFile(new URL(`src/components/ui/${name}`, root), "utf8")
    assert.doesNotMatch(source, /from ["'](?:radix-ui|@radix-ui\/)/, name)
  }
})

test("Linear surfaces and typography are not replaced by Nova color overrides", async () => {
  const css = await readFile(new URL("src/index.css", root), "utf8")
  assert.match(css, /--font-text:\s*var\(--font-sans\)/)
  assert.match(css, /--font-display:\s*var\(--font-sans\)/)
  for (const name of await readdir(new URL("src/components/ui/", root))) {
    const source = await readFile(new URL(`src/components/ui/${name}`, root), "utf8")
    assert.doesNotMatch(source, /\bdark:[^\s"']*(?:bg-|text-|border-|ring-)/, name)
  }
  const badge = await readFile(new URL("src/components/ui/badge.tsx", root), "utf8")
  assert.doesNotMatch(badge, /rounded-(?:full|[234]xl)|bg-primary|bg-secondary/)
  assert.match(badge, /bg-accent text-accent-foreground/)
  const sidebar = await readFile(new URL("src/components/ui/sidebar.tsx", root), "utf8")
  assert.match(sidebar, /data-active:bg-accent/)
})

test("every documented Linear color is the exact light or dark CSS token", async () => {
  const design = await readFile(new URL("../../docs/frontend.md", root), "utf8")
  const css = await readFile(new URL("src/index.css", root), "utf8")
  const colors = design.match(/colors:\n([\s\S]*?)\ntypography:/)[1]
  const light = css.match(/:root \{([\s\S]*?)\n\}/)[1]
  const dark = css.match(/\.dark \{([\s\S]*?)\n\}/)[1]
  for (const [, name, expected] of colors.matchAll(/ {2}([\w-]+): "(#[\da-f]+)"/g)) {
    const isDark = name.startsWith("dark-")
    const token = isDark ? name.slice(5) : name
    const actual = (isDark ? dark : light).match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]
    assert.equal(actual, expected, name)
  }
})

test("code surfaces use the bundled developer font and complete local syntax palettes", async () => {
  const css = await readFile(new URL("src/index.css", root), "utf8")
  assert.match(css, /@import "@fontsource-variable\/jetbrains-mono"/)
  assert.match(css, /--font-mono:\s*"JetBrains Mono Variable", var\(--font-mono-system\)/)

  const prism = await readFile(
    new URL("node_modules/prism-color-variables/variables.css", root),
    "utf8",
  )
  const tokenNames = [
    ...new Set(
      [...prism.matchAll(/var\(--code-highlight-([\w-]+)-color,/g)].map(([, name]) => name),
    ),
  ]
  const light = css.match(/:root \{([\s\S]*?)\n\}/)[1]
  const dark = css.match(/\.dark \{([\s\S]*?)\n\}/)[1]
  for (const name of tokenNames) {
    assert.match(light, new RegExp(`--code-highlight-${name}-color:`), `light ${name}`)
    assert.match(dark, new RegExp(`--code-highlight-${name}-color:`), `dark ${name}`)
  }
})

test("collapsed sidebar clears expanded row height and visually hides rich labels", async () => {
  const sidebar = await readFile(new URL("src/components/ui/sidebar.tsx", root), "utf8")
  assert.match(sidebar, /group-data-\[collapsible=icon\]:min-h-0!/)
  for (const name of ["project-manager"]) {
    const source = await readFile(new URL(`src/components/${name}.tsx`, root), "utf8")
    assert.match(source, /min-w-0[^"\n]*group-data-\[collapsible=icon\]:sr-only/, name)
    assert.doesNotMatch(source, /className="h-auto min-h-11/, name)
  }
})

test("application sidebars use the official offcanvas collapse mode", async () => {
  for (const name of ["project-manager"]) {
    const source = await readFile(new URL(`src/components/${name}.tsx`, root), "utf8")
    assert.match(source, /<Sidebar variant="inset" collapsible="offcanvas">/, name)
  }
})

test("selection surfaces use accent while hover remains a lighter transient state", async () => {
  const tabs = await readFile(new URL("src/components/ui/coss-tabs.tsx", root), "utf8")
  assert.match(tabs, /-z-1 rounded-md bg-accent/)
  assert.match(tabs, /not-data-active:hover:bg-accent\/50/)
  assert.match(tabs, /data-active:text-accent-foreground/)
  const menu = await readFile(new URL("src/components/ui/dropdown-menu.tsx", root), "utf8")
  assert.match(menu, /data-checked:bg-accent/)
  assert.match(menu, /focus:bg-accent\/50/)
})

test("sidebar and remaining selectable surfaces share accent interaction colors", async () => {
  const css = await readFile(new URL("src/index.css", root), "utf8")
  assert.equal((css.match(/--sidebar-accent: var\(--accent\);/g) ?? []).length, 2)
  for (const name of ["sidebar", "table", "combobox", "item", "badge", "field", "coss-tabs"]) {
    const source = await readFile(new URL(`src/components/ui/${name}.tsx`, root), "utf8")
    assert.doesNotMatch(
      source,
      /(?:hover|data-highlighted):bg-(?:white|background|sidebar-accent)(?:[\s"']|\/)/,
      name,
    )
    assert.match(source, /(?:hover|data-highlighted):bg-accent\/50/, name)
  }
})

test("review navigation uses compact text-only view tabs", async () => {
  const toolbar = await readFile(new URL("src/components/review-toolbar.tsx", root), "utf8")
  assert.match(toolbar, /variant="view"/)
  assert.match(toolbar, /className="max-w-full overflow-x-auto"/)
  for (const name of ["worktree-review"]) {
    const source = await readFile(new URL(`src/components/${name}.tsx`, root), "utf8")
    assert.match(source, /ui\/coss-tabs/)
    assert.match(source, /<ReviewToolbar/)
    assert.equal((source.match(/<TabsTrigger value="[^"]+">/g) ?? []).length, 6)
    assert.doesNotMatch(source, /lucide-react/)
  }
})

test("Linear segments match compact button height and avoid elevated mobile styling", async () => {
  const sizes = await readFile(new URL("src/lib/segmented-control.ts", root), "utf8")
  assert.match(sizes, /default: "h-7 px-2(?: [^"]+)?"/)
  assert.doesNotMatch(sizes, /sm:h-|text-base|shadow-/)
  const tabs = await readFile(new URL("src/components/ui/coss-tabs.tsx", root), "utf8")
  assert.match(tabs, /rounded-lg bg-muted\/50 p-0.5/)
  assert.doesNotMatch(tabs, /text-base|shadow-/)
})

test("short segments have a minimum width while labels stay centered", async () => {
  const sizes = await readFile(new URL("src/lib/segmented-control.ts", root), "utf8")
  assert.match(sizes, /default: "h-7 px-2 min-w-16"/)
  assert.match(sizes, /sm: "h-6 px-2 min-w-14"/)
  assert.match(sizes, /lg: "h-8 px-2.5 min-w-18"/)
  const tabs = await readFile(new URL("src/components/ui/coss-tabs.tsx", root), "utf8")
  assert.match(tabs, /items-center justify-center/)
  assert.match(tabs, /segmentedControlItemSizeClassNames\[resolvedSize\]/)
})

test("workspace header stays outside the framed main content", async () => {
  const source = await readFile(new URL("src/components/project-manager.tsx", root), "utf8")
  const headerStart = source.indexOf('className="app-header ')
  const headerEnd = source.indexOf("</header>", headerStart)
  const insetStart = source.indexOf("<SidebarInset")
  assert.ok(
    headerStart >= 0 && headerEnd < insetStart,
    "The title and sidebar controls must precede the main frame",
  )
  assert.doesNotMatch(source.slice(headerStart, headerEnd), /<SidebarTrigger/)
  assert.match(source.slice(insetStart), /md:rounded-xl md:ring-1 md:ring-border/)
})
