import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = new URL("./", import.meta.url)
const target = new URL("dist/marketplace/plugins/sidebar-lab/", root)
await mkdir(new URL("dist/", target), { recursive: true })
await cp(new URL("plugin/", root), target, { recursive: true })
const ui = await build({
  entryPoints: [fileURLToPath(new URL("src/ui.ts", root))],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
})
const template = await readFile(new URL("src/app.html", root), "utf8")
await writeFile(
  new URL("dist/app.html", target),
  template.replace("/* APP_SCRIPT */", () =>
    ui.outputFiles[0].text.replaceAll("</script", "<\\/script"),
  ),
)
await build({
  entryPoints: [fileURLToPath(new URL("src/stdio.ts", root))],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile: fileURLToPath(new URL("dist/server.mjs", target)),
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
})
await writeFile(
  new URL(".mcp.json", target),
  JSON.stringify(
    {
      mcpServers: {
        "sidebar-lab": {
          command: process.execPath,
          args: [fileURLToPath(new URL("dist/server.mjs", target))],
        },
      },
    },
    null,
    2,
  ),
)
const catalog = new URL("dist/marketplace/.agents/plugins/", root)
await mkdir(catalog, { recursive: true })
await writeFile(
  new URL("marketplace.json", catalog),
  JSON.stringify(
    {
      name: "sidebar-lab-local",
      interface: { displayName: "Sidebar Lab Local" },
      plugins: [
        {
          name: "sidebar-lab",
          source: { source: "local", path: "./plugins/sidebar-lab" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Developer Tools",
        },
      ],
    },
    null,
    2,
  ),
)
console.log(`Local marketplace: ${fileURLToPath(new URL("dist/marketplace", root))}`)
