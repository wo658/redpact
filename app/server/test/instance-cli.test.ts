import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, test } from "vitest"

const token = "redpact-instance-test-token-at-least-32-characters"
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "redpact-instance-"))
  cleanups.push(() => rm(path, { recursive: true, force: true }))
  return path
}

function launch(path: string, args: string[] = []) {
  const child = spawn(process.execPath, [cli, "serve", "--data-dir", path, ...args], {
    env: { ...process.env, REDPACT_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const exit = once(child, "exit")
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
    }
    await exit
  }
  cleanups.push(stop)
  return {
    exit,
    stop,
    output: () => output,
    async ready() {
      await Promise.race([
        expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy(),
        exit.then(() => {
          throw new Error(`Server exited before listening: ${output}`)
        }),
      ])
      return Number(/"port":(\d+)/.exec(output)?.[1])
    },
  }
}

async function json(path: string, name: string) {
  return JSON.parse(await readFile(join(path, name), "utf8"))
}

test("first start persists JSON defaults and keeps instance identity across restarts", async () => {
  const path = await directory()
  const first = launch(path, ["--port", "0"])
  await first.ready()
  expect(existsSync(join(path, "settings.json"))).toBe(true)
  expect(await json(path, "settings.json")).toEqual({
    server: { port: 54318 },
  })
  const instance = await json(path, "instance.json")
  expect(instance).toEqual({
    version: 1,
    id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    createdAt: expect.any(String),
  })
  expect(Number.isNaN(Date.parse(instance.createdAt))).toBe(false)
  expect(existsSync(join(path, ".environment-owner"))).toBe(false)
  await first.stop()
  const second = launch(path, ["--port", "0"])
  await second.ready()
  expect(await json(path, "instance.json")).toEqual(instance)
})

test("settings.json supplies the port and CLI override does not rewrite settings", async () => {
  const path = await directory()
  const source = '{"server":{"port":0}}\n'
  await writeFile(join(path, "settings.json"), source)
  const configured = launch(path)
  const port = await configured.ready()
  expect(port).not.toBe(4318)
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(200)
  await configured.stop()

  // Occupy the configured port so only a working CLI override can start the server.
  const occupied = createServer()
  occupied.listen(0, "127.0.0.1")
  await once(occupied, "listening")
  cleanups.push(() => new Promise<void>((resolve) => occupied.close(() => resolve())))
  const address = occupied.address()
  if (!address || typeof address === "string") {
    throw new Error("Missing test port")
  }
  const overridden = JSON.stringify({ server: { port: address.port } })
  await writeFile(join(path, "settings.json"), overridden)
  const server = launch(path, ["--port", "0"])
  expect(await server.ready()).not.toBe(address.port)
  expect(await readFile(join(path, "settings.json"), "utf8")).toBe(overridden)
})

test("instance identity is generated independently of obsolete owner files", async () => {
  const path = await directory()
  const owner = `${randomUUID()}\n`
  await writeFile(join(path, ".environment-owner"), owner)
  const server = launch(path, ["--port", "0"])
  await server.ready()
  expect((await json(path, "instance.json")).id).not.toBe(owner.trim())
  expect(await readFile(join(path, ".environment-owner"), "utf8")).toBe(owner)
})

test.each([
  ["malformed JSON", "{", "Invalid instance settings"],
  ["unknown field", '{"server":{"host":"0.0.0.0"}}', "server"],
  ["string port", '{"server":{"port":"54318"}}', "server.port"],
  ["invalid port", '{"server":{"port":65536}}', "server.port"],
  ["removed logging setting", '{"logging":{"level":"info"}}', "Invalid instance settings"],
])("rejects %s without overwriting configuration", async (_name, source, message) => {
  const path = await directory()
  await writeFile(join(path, "settings.json"), source)
  const server = launch(path, ["--port", "0"])
  expect((await server.exit)[0]).toBe(1)
  expect(server.output()).toContain(message)
  expect(await readFile(join(path, "settings.json"), "utf8")).toBe(source)
  expect(existsSync(join(path, ".writer.lock"))).toBe(false)
})

test("server emits startup information without a logging setting", async () => {
  const path = await directory()
  await writeFile(join(path, "settings.json"), JSON.stringify({ server: { port: 0 } }))
  const server = launch(path)
  const port = await server.ready()
  expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200)
  expect(server.output()).toContain('"level":30')
  expect(server.output()).toContain("Redpact listening on loopback")
  await server.stop()
  expect((await server.exit)[0]).toBe(0)
})

test.each([
  "{",
  JSON.stringify({ version: 2, id: randomUUID(), createdAt: new Date().toISOString() }),
])("invalid instance metadata fails without recreating identity (%s)", async (source) => {
  const path = await directory()
  await writeFile(join(path, "instance.json"), source)
  const server = launch(path, ["--port", "0"])
  expect((await server.exit)[0]).toBe(1)
  expect(server.output()).toContain("Invalid instance metadata")
  expect(await readFile(join(path, "instance.json"), "utf8")).toBe(source)
  expect(existsSync(join(path, ".environment-owner"))).toBe(false)
  expect(existsSync(join(path, ".writer.lock"))).toBe(false)
})

test("CLI retains worktree choices across restart and MCP captures them under Ask", async () => {
  const data = await directory()
  const project = await directory()
  await mkdir(join(project, ".redpact"))
  await mkdir(join(project, "integration"))
  await writeFile(
    join(project, ".redpact/settings.json"),
    JSON.stringify({ composeFiles: ["compose.yaml"] }),
  )
  await writeFile(join(project, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
  await writeFile(
    join(project, "integration/example.test.ts"),
    'import {test, expect} from "vitest"; test("example", () => expect(1).toBe(1))',
  )
  await writeFile(
    join(data, "settings.json"),
    JSON.stringify({ server: { port: 54318 }, approval: "ask" }),
  )
  const first = launch(data, ["--port", "0", "--project", project])
  const port = await first.ready()
  const base = `http://127.0.0.1:${port}`
  const projects = await (await fetch(`${base}/api/projects`)).json()
  const worktrees = await (await fetch(`${base}/api/projects/${projects[0].id}/worktrees`)).json()
  const selection = { services: ["app"], select: {} }
  const saved = await fetch(`${base}/api/worktrees/${worktrees[0].id}/selection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  })
  expect(saved.status).toBe(200)
  await first.stop()
  const restarted = launch(data, ["--port", "0"])
  const nextPort = await restarted.ready()
  const response = await fetch(`http://127.0.0.1:${nextPort}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "run_tests", arguments: { path: project } },
    }),
  })
  const result = (await response.json()).result
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.state).toBe("awaiting_approval")
  expect(result._meta.redpact.review.selection).toEqual(selection)
  expect(existsSync(join(data, "environments"))).toBe(false)
})
