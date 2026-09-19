import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const executable = process.argv[2]
assert(executable, "Usage: node tools/install/smoke.mjs /absolute/path/to/redpact")
const state = await mkdtemp(join(tmpdir(), "redpact-install-smoke-"))
const child = spawn(executable, ["serve", "--port", "0", "--data-dir", state], {
  stdio: ["ignore", "pipe", "pipe"],
})
const exited = once(child, "exit")
let output = ""
child.stdout.on("data", (chunk) => {
  output += chunk
})
child.stderr.on("data", (chunk) => {
  output += chunk
})
try {
  let port
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
  console.log("PASS: installed executable, health, bundled viewer and MCP configure describe")
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM")
  }
  await exited
  await rm(state, { recursive: true, force: true })
}
