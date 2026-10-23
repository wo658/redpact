import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "../app/web/node_modules/vite/dist/node/index.js"

// Build the shipped MCP entry for the disposable browser host, without a second UI.
const result = await build({
  root: fileURLToPath(new URL("../app/web/", import.meta.url)),
  base: "./",
  mode: "sidebar",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "warn",
  build: {
    write: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: fileURLToPath(new URL("../app/web/src/entries/sidebar.tsx", import.meta.url)),
      formats: ["es"],
      fileName: "sidebar",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output)
const script = output
  .filter((asset) => asset.type === "chunk")
  .map((asset) => asset.code)
  .join("\n")
const css = output
  .filter((asset) => asset.type === "asset" && asset.fileName.endsWith(".css"))
  .map((asset) => asset.source)
  .join("\n")
const template = await readFile(
  new URL("../examples/sidebar-app/src/redpact/app.html", import.meta.url),
  "utf8",
)
const favicon = await readFile(new URL("../app/web/public/favicon.svg", import.meta.url))
const sprite = await readFile(new URL("../app/web/public/icons.svg", import.meta.url), "utf8")
await writeFile(
  new URL("../app/web/dist/embedded-viewer.html", import.meta.url),
  template
    .replaceAll("APP_FAVICON", `data:image/svg+xml;base64,${favicon.toString("base64")}`)
    .replace("</head>", () => `<style>${css}</style></head>`)
    .replace("<body>", () => `<body><div hidden>${sprite}</div>`)
    .replace("/* APP_SCRIPT */", () => script.replaceAll("</script", "<\\/script")),
)
