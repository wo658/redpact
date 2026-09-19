import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const target = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
const folder = join(desktop, "node_modules/.redpact/target", target, "release/bundle/dmg")
const supplied = process.argv[2] ? resolve(process.argv[2]) : undefined
// Tauri intentionally rejects executable paths containing macOS /var symlinks.
const temporary = await realpath(await mkdtemp(join(tmpdir(), "redpact-dmg-")))
const mount = join(temporary, "volume")
const installed = supplied?.endsWith(".app") ? supplied : join(temporary, "Redpact.app")
const run = (command, args) => execFileSync(command, args, { encoding: "utf8" })
if (!supplied?.endsWith(".app")) {
  const files = supplied
    ? [supplied]
    : (await readdir(folder))
        .filter((name) => name.endsWith(".dmg") || name.endsWith(".zip"))
        .map((name) => join(folder, name))
  assert.equal(files.length, 1, "Expected one architecture-specific desktop package")
  if (files[0].endsWith(".zip")) {
    run("ditto", ["-x", "-k", files[0], temporary])
  } else {
    run("hdiutil", ["attach", files[0], "-nobrowse", "-readonly", "-mountpoint", mount])
    try {
      run("ditto", [join(mount, "Redpact.app"), installed])
    } finally {
      run("hdiutil", ["detach", mount])
    }
  }
}
run("codesign", ["--verify", "--deep", "--strict", installed])
const resources = join(installed, "Contents/Resources/runtime")
assert.equal(run(join(resources, "bin/node"), ["-p", "process.arch"]).trim(), process.arch)
const info = run("/usr/libexec/PlistBuddy", [
  "-c",
  "Print :CFBundleExecutable",
  join(installed, "Contents/Info.plist"),
]).trim()
const port = 55431
await writeFile(join(temporary, "settings.json"), JSON.stringify({ server: { port } }))
assert.equal(
  await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
    .then(() => true)
    .catch(() => false),
  false,
  "Verification port must not be owned by an existing instance",
)
const app = spawn(await realpath(join(installed, "Contents/MacOS", info)), [], {
  env: { ...process.env, REDPACT_DESKTOP_DATA_DIR: temporary },
  stdio: "inherit",
})
const origin = `http://127.0.0.1:${port}`
async function request(path, options) {
  return fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(3000) })
}
try {
  let healthy = false
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(app.exitCode, null, "Native desktop exited before verification")
    assert.equal(app.signalCode, null, "Native desktop terminated before verification")
    healthy = await request("/api/health")
      .then((response) => response.ok)
      .catch(() => false)
    if (healthy) {
      break
    }
    await setTimeout(1000)
  }
  assert(healthy, "Installed desktop must start its own server")
  const viewer = await request("/")
  assert(viewer.ok)
  assert.match(await viewer.text(), /<div id="root">/)
  const mcp = await request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "desktop-install-verification", version: "1.0.0" },
      },
    }),
  })
  assert(mcp.ok, `MCP initialize status ${mcp.status}`)
  assert.match(await mcp.text(), /serverInfo/)
  const configured = await request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "configure",
        arguments: { action: "describe" },
      },
    }),
  })
  assert(configured.ok)
  const result = await configured.json()
  assert.equal(result.result.isError, false)
  assert.equal(result.result.structuredContent.specification.path, ".redpact/settings.json")
  assert.equal(app.exitCode, null, "Native desktop must remain running")
  console.log(
    `Verified installed desktop: ${process.arch}; native app, code signature, bundled Node, viewer, health and MCP`,
  )
} catch (error) {
  console.error(
    await readFile(join(temporary, "desktop-server.log"), "utf8").catch(() => "No backend log"),
  )
  throw error
} finally {
  app.kill("SIGTERM")
  for (let attempt = 0; attempt < 35; attempt++) {
    const running = await request("/api/health")
      .then((response) => response.ok)
      .catch(() => false)
    if (!running) {
      break
    }
    await setTimeout(1000)
  }
  assert.equal(
    await request("/api/health")
      .then((response) => response.ok)
      .catch(() => false),
    false,
    "Owned server must stop after native parent exits",
  )
}
