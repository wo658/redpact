import { copyFile, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const root = fileURLToPath(new URL("../", import.meta.url))
const output = new URL("../../server/dist/mcp/", import.meta.url)
const result = await build({
  root,
  logLevel: "error",
  build: {
    write: false,
    assetsInlineLimit: 1000000,
    cssCodeSplit: false,
    rolldownOptions: {
      input: fileURLToPath(new URL("../src/entries/mcp-app.tsx", import.meta.url)),
      output: { codeSplitting: false },
    },
  },
})
const assets = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
const scripts = assets.filter((asset) => asset.type === "chunk")
if (scripts.length !== 1) {
  throw new Error("MCP App must build to one self-contained script")
}
const css = assets
  .filter((asset) => asset.type === "asset" && asset.fileName.endsWith(".css"))
  .map((asset) => asset.source)
  .join("\n")
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redpact</title><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script type="module">${scripts[0].code.replaceAll("</script", "<\\/script")}</script></body></html>`
await mkdir(output, { recursive: true })
await writeFile(new URL("app.html", output), html)
await copyFile(
  new URL("../node_modules/@modelcontextprotocol/ext-apps/LICENSE", import.meta.url),
  new URL("MCP-APPS-LICENSE", output),
)
// The bundled SDK, React and UI retain their upstream notices in the release artifact.
await writeFile(
  new URL("NOTICE", output),
  await readFile(new URL("../NOTICE", import.meta.url), "utf8"),
)

const packages = new Set(
  Object.keys(scripts[0].modules)
    .map((id) => id.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1])
    .filter(Boolean),
)
const notices = []
for (const directory of packages) {
  const names = await readdir(directory)
  for (const name of names.filter((name) => /^(license|licence|notice|ofl)(\.|$)/i.test(name))) {
    notices.push(
      `${directory.split("node_modules/").at(-1)} / ${name}\n${await readFile(`${directory}/${name}`, "utf8")}`,
    )
  }
}
await writeFile(new URL("THIRD_PARTY_LICENSES", output), notices.join("\n\n"))

await copyFile(new URL("../LICENSE", import.meta.url), new URL("LICENSE", output))
await cp(new URL("../licenses/", import.meta.url), new URL("licenses/", output), {
  recursive: true,
})
