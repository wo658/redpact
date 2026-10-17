import { spawn } from "node:child_process"
import { mkdtemp, open, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"

export async function startCliRuntime(server: string, dataDir?: string) {
  const url = new URL(server)
  if (url.protocol !== "http:") {
    throw new Error("Runtime start requires HTTP")
  }
  let occupied = false
  try {
    const health = await fetch(`${server}/api/health`, { signal: AbortSignal.timeout(1000) })
    occupied = true
    if (health.ok && ((await health.json()) as { status?: string }).status === "ok") {
      return { state: "running", server, started: false }
    }
  } catch {
    /* An unavailable listener can be started below. */
  }
  if (occupied) {
    throw new Error("Selected port is already in use")
  }
  const entry = process.argv[1]
  if (!entry) {
    throw new Error("CLI executable is unavailable")
  }
  const args = [
    entry,
    "serve",
    "--host",
    url.hostname.replace(/^\[|\]$/g, ""),
    "--port",
    url.port || "80",
  ]
  if (dataDir) {
    args.push("--data-dir", dataDir)
  }
  const logPath = join(await mkdtemp(join(tmpdir(), "redpact-start-")), "runtime.log")
  const log = await open(logPath, "wx", 0o600)
  const child = spawn(process.execPath, args, { detached: true, stdio: ["ignore", log.fd, log.fd] })
  await log.close()
  let failure: Error | undefined
  let stopped = false
  child.once("error", (error) => {
    failure = error
  })
  child.once("exit", () => {
    stopped = true
  })
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failure || stopped) {
        throw failure ?? new Error(`Runtime exited before startup; see ${logPath}`)
      }
      // The marker belongs to this child; another listener on the port is not success.
      if (/"port":\d+/.test(await readFile(logPath, "utf8"))) {
        child.unref()
        return { state: "running", server, started: true, pid: child.pid, logPath }
      }
      await setTimeout(100)
    }
    throw new Error(`Runtime startup deadline exceeded; see ${logPath}`)
  } catch (error) {
    if (!stopped) {
      child.kill("SIGTERM")
    }
    throw error
  }
}
