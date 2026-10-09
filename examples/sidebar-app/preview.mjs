import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { build } from "esbuild"

const redpact = process.argv.includes("--redpact")
const pluginRoot =
  process.env.REDPACT_PREVIEW_PLUGIN_ROOT ??
  fileURLToPath(new URL("dist/redpact-marketplace/plugins/redpact-app/", import.meta.url))
const entry = redpact
  ? join(pluginRoot, "dist/server.mjs")
  : fileURLToPath(new URL("dist/marketplace/plugins/sidebar-lab/dist/server.mjs", import.meta.url))
const client = new Client({ name: "sidebar-browser-harness", version: "0.1.0" })
await client.connect(
  new StdioClientTransport({
    command: redpact ? join(pluginRoot, "bin/node") : process.execPath,
    env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
    args: [entry],
  }),
)
const result = await client.readResource({
  uri: redpact ? "ui://redpact-app/0.5.1/page.html" : "ui://sidebar-lab/main.html",
})
const html = result.contents[0].text
const frames = result.contents[0]._meta?.ui?.csp?.frameDomains ?? []
const appCsp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-src ${frames.length ? frames.join(" ") : "'none'"};`
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("src/harness.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
})
const port = Number(process.env.PORT ?? (redpact ? 4320 : 4319))
const origin = `http://127.0.0.1:${port}`
const allowed = new Set(
  redpact
    ? [
        "get_redpact_page",
        "redpact_viewer_request",
        "redpact_viewer_events",
        "start_redpact_server",
        "install_redpact_runtime",
        "stop_redpact_server",
        "connect_redpact_project",
        "get_redpact_evidence",
      ]
    : ["get_lab_state", "increment_lab", "reset_lab"],
)
async function callTool(req, res) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 4096) {
      res.writeHead(413).end()
      return
    }
  }
  const params = JSON.parse(body)
  if (!allowed.has(params.name)) {
    res.writeHead(400).end()
    return
  }
  const reply = await client.callTool({ name: params.name, arguments: params.arguments ?? {} })
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(reply))
}
const server = createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end()
      return
    }
    if (req.method === "POST" && req.url === "/tool") {
      await callTool(req, res)
      return
    }
    if (req.method !== "GET") {
      res.writeHead(405).end()
      return
    }
    if (req.url === "/app.html") {
      res
        .writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": appCsp })
        .end(html)
      return
    }
    if (req.url === "/host.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(bundled.outputFiles[0].text)
      return
    }
    if (req.url === "/") {
      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end(
          (await readFile(new URL("test/harness.html", import.meta.url), "utf8")).replaceAll(
            "Sidebar Lab",
            redpact ? "Redpact App" : "Sidebar Lab",
          ),
        )
      return
    }
    res.writeHead(404).end()
  } catch {
    res.writeHead(500).end("Local MCP request failed")
  }
})
server.on("error", async (failure) => {
  console.error(failure.message)
  await client.close()
  process.exitCode = 1
})
server.listen(port, "127.0.0.1", () => console.log(`Browser harness: ${origin}`))
async function close() {
  server.close()
  await client.close()
  process.exit(0)
}
process.on("SIGINT", () => void close())
process.on("SIGTERM", () => void close())
