import { execFile, spawn } from "node:child_process"
import { createServer, request } from "node:http"
import { promisify } from "node:util"

// Test-only fixture access inside the disposable image. Never package this entry with the product.
const execute = promisify(execFile)
const child = spawn(
  process.execPath,
  [
    "app/server/dist/cli.js",
    "serve",
    "--data-dir",
    "/tmp/redpact-e2e-state",
    "--port",
    "54318",
    "--host",
    "0.0.0.0",
  ],
  { stdio: "inherit" },
)
const fixtures = createServer(async (req, res) => {
  if (
    req.method !== "POST" ||
    req.url !== "/node" ||
    req.headers.origin ||
    req.headers["sec-fetch-site"] ||
    req.headers["content-type"] !== "application/json"
  ) {
    res.writeHead(403).end()
    return
  }
  try {
    let body = ""
    for await (const chunk of req) {
      body += chunk
      if (body.length > 1024 * 1024) {
        throw new Error("Fixture request too large")
      }
    }
    const { source, input } = JSON.parse(body)
    const result = await execute(
      process.execPath,
      ["--input-type=module", "-e", source, JSON.stringify(input)],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    )
    res.writeHead(200, { "content-type": "application/json" }).end(result.stdout)
  } catch (error) {
    res
      .writeHead(500, { "content-type": "application/json" })
      .end(JSON.stringify({ error: String(error) }))
  }
}).listen(54319, "0.0.0.0")

// The disposable UI deployment has an explicit public origin; the upstream product stays loopback-only.
const ui = createServer((req, res) => {
  const host = req.headers.host ?? ""
  if (
    !/^(app\.redpact\.test|127\.0\.0\.1|localhost):\d+$/.test(host) ||
    (req.headers.origin && req.headers.origin !== `http://${host}`)
  ) {
    res.writeHead(403).end()
    return
  }
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 54318,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: "localhost:54318",
        ...(req.headers.origin ? { origin: "http://localhost:54318" } : {}),
      },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(res)
    },
  )
  upstream.on("error", () => res.writeHead(502).end())
  res.on("close", () => upstream.destroy())
  req.pipe(upstream)
}).listen(54320, "0.0.0.0")
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    fixtures.close()
    ui.close()
    child.kill(signal)
  })
}
child.once("exit", (code) => {
  fixtures.close()
  ui.close()
  process.exitCode = code ?? 1
})
