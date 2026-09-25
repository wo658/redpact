import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const executable = process.argv[2]
assert(executable, "Usage: node tools/install/smoke.mjs /absolute/path/to/redpact")
const state = await mkdtemp(join(tmpdir(), "redpact-install-smoke-"))
const child = spawn(
  executable,
  [...process.argv.slice(3), "serve", "--port", "0", "--data-dir", state],
  {
    stdio: ["ignore", "pipe", "pipe"],
  },
)
const exited = once(child, "exit")
let output = ""
child.stdout.on("data", (chunk) => {
  output += chunk
})
child.stderr.on("data", (chunk) => {
  output += chunk
})
let port
try {
  for (let attempt = 0; attempt < 150; attempt++) {
    port = /"port":(\d+)/.exec(output)?.[1]
    if (port) {
      break
    }
    assert(child.exitCode === null, output)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert(port, output)
  const base = `http://127.0.0.1:${port}`
  assert.equal((await fetch(`${base}/api/health`)).status, 200)
  const viewer = await fetch(base)
  assert.equal(viewer.status, 200)
  assert.match(await viewer.text(), /<div id="root">/)
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "configure",
        arguments: { action: "describe" },
      },
    }),
  })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.result.isError, false)
  assert.equal(result.result.structuredContent.specification.path, ".redpact/settings.json")
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM")
  }
  const [code, signal] = await exited
  if (process.platform === "win32") {
    assert(code === 0 || signal === "SIGTERM", `Installed CLI shutdown failed: ${output}`)
  } else {
    assert.equal(code, 0, `Installed CLI shutdown failed (${signal}): ${output}`)
  }
  if (port) {
    let running = true
    for (let attempt = 0; attempt < 100; attempt++) {
      running = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      })
        .then(() => true)
        .catch(() => false)
      if (!running) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(running, false, "Owned server must stop after CLI exit")
  }
  await rm(state, { recursive: true, force: true })
}
console.log(
  "PASS: installed executable, health, bundled viewer, MCP configure describe and shutdown",
)
