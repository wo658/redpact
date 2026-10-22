import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import { build as buildViewer } from "../../../app/web/node_modules/vite/dist/node/index.js"

const root = new URL("./", import.meta.url)
const output = new URL("../dist/test-plan-probe-marketplace/", root)
const plugin = new URL("plugins/test-plan-probe/", output)
await mkdir(new URL("dist/", plugin), { recursive: true })
const app = await buildViewer({
  root: new URL("../../../app/web/", root).pathname,
  mode: "sidebar",
  base: "./",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "warn",
  build: {
    write: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: new URL("../../../app/web/src/entries/test-plan-probe.tsx", root).pathname,
      formats: ["iife"],
      name: "RedpactTestPlanProbe",
    },
  },
})
const assets = (Array.isArray(app) ? app : [app]).flatMap((bundle) => bundle.output)
const script = assets
  .filter((asset) => asset.type === "chunk")
  .map((asset) => asset.code)
  .join("\n")
const css = assets
  .filter((asset) => asset.type === "asset" && asset.fileName.endsWith(".css"))
  .map((asset) => asset.source)
  .join("\n")
const template = await readFile(new URL("page.html", root), "utf8")
const html = template
  .replace("</head>", () => `<style>${css}</style></head>`)
  .replace("/* APP_SCRIPT */", () => script.replaceAll("</script", "<\\/script"))
const uri = `ui://redpact-test-plan-probe/${createHash("sha256").update(html).digest("hex")}/app.html`
await build({
  entryPoints: [new URL("server.ts", root).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  outfile: new URL("dist/server.mjs", plugin).pathname,
  define: { PROBE_HTML: JSON.stringify(html), PROBE_URI: JSON.stringify(uri) },
})
await writeFile(new URL("dist/page.html", plugin), html)
await writeFile(
  new URL("plugin.json", plugin),
  JSON.stringify(
    {
      name: "test-plan-probe",
      version: "0.0.1",
      description: "Local Redpact test-plan editing and chat round-trip probe.",
      extensions: {
        "com.openai": {
          interface: {
            displayName: "Redpact Test Plan Probe",
            shortDescription: "Edit a plan and submit it to this chat.",
            category: "Developer Tools",
            defaultPrompt: ["Open the test plan probe."],
          },
        },
      },
    },
    null,
    2,
  ),
)
const pluginRootVariable = "$" + "{PLUGIN_ROOT}"
await writeFile(
  new URL("mcp.json", plugin),
  JSON.stringify(
    {
      mcpServers: {
        "test-plan-probe": {
          type: "stdio",
          command: process.execPath,
          args: [`${pluginRootVariable}/dist/server.mjs`],
          cwd: "./",
        },
      },
    },
    null,
    2,
  ),
)
await mkdir(new URL(".agents/plugins/", output), { recursive: true })
await writeFile(
  new URL(".agents/plugins/marketplace.json", output),
  JSON.stringify(
    {
      name: "redpact-test-plan-probe",
      interface: { displayName: "Redpact local probes" },
      plugins: [
        {
          name: "test-plan-probe",
          source: { source: "local", path: "./plugins/test-plan-probe" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Developer Tools",
        },
      ],
    },
    null,
    2,
  ),
)
console.log(output.pathname)
