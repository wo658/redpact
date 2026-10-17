import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url))
async function command(args: string[], stdin?: string) {
  const child = spawn(process.execPath, [cli, ...args], { stdio: ["pipe", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (value) => {
    stdout += value
  })
  child.stderr.on("data", (value) => {
    stderr += value
  })
  child.stdin.end(stdin)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  return { code, stdout, stderr, json: () => JSON.parse(stdout) }
}
async function unusedPort() {
  const socket = createServer()
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject)
    socket.listen(0, "127.0.0.1", resolve)
  })
  const address = socket.address()
  if (!address || typeof address === "string") {
    throw new Error("Missing port")
  }
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

test("installed CLI reports its package version and keeps Git outside its command tree", async () => {
  const version = await command(["--version"])
  expect(version.code).toBe(0)
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  const removed = await command(["git", "status", "--json"])
  expect(removed.code).toBe(2)
  expect(removed.json()).toMatchObject({ version: 1, ok: false, error: { code: "INVALID_INPUT" } })
})

test("CLI starts an isolated runtime and changes project settings without JSON file access", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-agent-cli-"))
  const origin = `http://127.0.0.1:${await unusedPort()}`
  let pid: number | undefined
  const run = (...args: string[]) => command([...args, "--server", origin, "--json"])
  try {
    const started = await run("runtime", "start", "--data-dir", join(root, "state"))
    expect(started.code, started.stderr + started.stdout).toBe(0)
    pid = started.json().data.pid
    expect((await run("runtime", "status")).json().data.status).toBe("ok")
    const described = await run("settings", "describe", "--scope", "project", "--path", root)
    expect(described.code, described.stdout).toBe(0)
    const created = await run(
      "settings",
      "patch",
      "--scope",
      "project",
      "--path",
      root,
      "--create",
      "--patch",
      JSON.stringify([
        { op: "add", path: "/tests", value: { timeoutMs: 10000, env: { KEEP: "sibling" } } },
      ]),
    )
    expect(created.code, created.stdout).toBe(0)
    const get = await run("settings", "get", "--scope", "project", "--path", root)
    expect(get.code, get.stdout).toBe(0)
    const revision = get.json().data.revision
    const changed = await command(
      [
        "settings",
        "patch",
        "--scope",
        "project",
        "--path",
        root,
        "--revision",
        revision,
        "--patch-stdin",
        "--server",
        origin,
        "--json",
      ],
      JSON.stringify([{ op: "replace", path: "/tests/timeoutMs", value: 180000 }]),
    )
    expect(changed.code, changed.stdout).toBe(0)
    const subtree = await run(
      "settings",
      "get",
      "--scope",
      "project",
      "--path",
      root,
      "--pointer",
      "/tests",
    )
    expect(subtree.json().data.value).toEqual({ timeoutMs: 180000, env: { KEEP: "sibling" } })
    const stale = await run(
      "settings",
      "patch",
      "--scope",
      "project",
      "--path",
      root,
      "--revision",
      revision,
      "--patch",
      JSON.stringify([{ op: "replace", path: "/tests/timeoutMs", value: 20000 }]),
    )
    expect(stale.code, stale.stdout).toBe(6)
    const connected = await run("projects", "connect", "--path", root)
    expect(connected.code, connected.stdout).toBe(0)
    const status = await run("workspace", "status", "--path", root)
    expect(status.json().data.observedBinding).toMatchObject({
      projectId: connected.json().data.id,
      disconnected: false,
    })
    const stopped = await run("runtime", "stop")
    expect(stopped.code, stopped.stdout).toBe(0)
    await expect
      .poll(
        async () => {
          try {
            await fetch(`${origin}/api/health`)
            return true
          } catch {
            return false
          }
        },
        { timeout: 10000 },
      )
      .toBe(false)
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGTERM")
      } catch {}
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 30000)
