import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { createDiagnosticLog } from "./diagnostics.js"

export function startComposeSession(options: {
  executable: string
  args: string[]
  cwd: string
  env: Record<string, string | undefined>
  spec: unknown
  signal: AbortSignal
  preparationLog: string
  servicesLog: string
  redact(value: string): string
  redactions: string[]
}) {
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: { ...options.env, TESTCONTAINERS_RYUK_ISOLATED: "true" },
    detached: true,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })
  const preparationPaths = [`${options.preparationLog}.stdout`, `${options.preparationLog}.stderr`]
  const preparationLogs = preparationPaths.map((path) =>
    createDiagnosticLog(path, options.redactions),
  )
  const services = new Map<string, ReturnType<typeof createDiagnosticLog>>()
  const servicePaths = new Map<string, string>()
  const endedSources = new Set<string>()
  const logs = () => [...preparationLogs, ...services.values()]
  async function readLog(path: string) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return ""
      }
      throw error
    }
  }
  async function snapshotServices() {
    const preparation = await Promise.all(preparationPaths.map(readLog))
    await writeFile(options.preparationLog, preparation.join("\n"), { mode: 0o600 })
    const parts: string[] = []
    for (const [source, path] of servicePaths) {
      const value = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return ""
        }
        throw error
      })
      parts.push(`[${source}]\n${value}`)
    }
    await writeFile(options.servicesLog, parts.join("\n"), { mode: 0o600 })
  }
  let closed = false
  const completion = new Promise<void>((resolve, reject) => {
    child.once("close", () => {
      closed = true
      void Promise.all(logs().map((log) => log.finish()))
        .then(snapshotServices)
        .then(() => resolve(), reject)
    })
  })
  void completion.catch(() => {})
  child.stderr?.on("data", (chunk) => {
    if (!closed) {
      preparationLogs[1].write(chunk)
    }
  })
  child.stdout?.on("data", (chunk) => {
    if (!closed) {
      preparationLogs[0].write(chunk)
    }
  })
  child.on("message", (message) => {
    const event = message as { type: string; message?: string; source?: string }
    if (event.type === "service-log-end" && event.source) {
      endedSources.add(event.source)
      const log = services.get(event.source)
      if (log) {
        void log.finish().catch(() => {})
      }
    }
    if (event.type === "service-log") {
      if (!closed) {
        const source = event.source ?? "service"
        if (endedSources.has(source)) {
          return
        }
        let log = services.get(source)
        if (!log) {
          const path = `${options.servicesLog}.sources/${services.size}.log`
          servicePaths.set(source, path)
          log = createDiagnosticLog(path, options.redactions)
          services.set(source, log)
        }
        log.write(event.message ?? "")
      }
    }
  })
  const kill = () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        /* The process may already have exited. */
      }
    }
  }
  function response(success: string, failure: string, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let aborted: Error | undefined
      const finish = (error?: Error) => {
        if (settled) {
          return
        }
        settled = true
        child.off("message", onMessage)
        child.off("error", onError)
        child.off("close", onExit)
        signal?.removeEventListener("abort", onAbort)
        const persisted = closed
          ? completion
          : Promise.all(logs().map((log) => log.flush())).then(snapshotServices)
        void persisted
          .then(async () => {
            if (!error) {
              resolve()
              return
            }
            const evidence = await Promise.all(
              [options.preparationLog, options.servicesLog].map(async (path) => {
                try {
                  return await readFile(path, "utf8")
                } catch (readError) {
                  if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
                    return ""
                  }
                  throw readError
                }
              }),
            )
            // Evidence files are stream-redacted before any display truncation.
            reject(
              new Error(`${options.redact(error.message)}\n${evidence.join("\n").slice(0, 48000)}`),
            )
          })
          .catch((persistenceError: unknown) => {
            const reason =
              persistenceError instanceof Error
                ? persistenceError.message
                : String(persistenceError)
            reject(
              new Error(
                options.redact(
                  [...(error ? [error.message] : []), `Log persistence failed: ${reason}`].join(
                    "\n",
                  ),
                ),
              ),
            )
          })
      }
      const onMessage = (message: unknown) => {
        const event = message as { type: string; message?: string }
        if (event.type === success) {
          finish()
        }
        if (event.type === failure) {
          finish(new Error(event.message || "Compose operation failed"))
        }
      }
      const onError = (error: Error) => finish(error)
      const onExit = () => finish(aborted ?? new Error("Compose worker exited unexpectedly"))
      const onAbort = () => {
        aborted = new Error("Compose operation cancelled or timed out")
        kill()
        // close follows stdio drain; only then finalize decoder/redaction buffers.
        if (closed) {
          finish(aborted)
        }
      }
      child.on("message", onMessage)
      child.once("error", onError)
      child.once("close", onExit)
      signal?.addEventListener("abort", onAbort, { once: true })
      if (signal?.aborted) {
        onAbort()
      }
    })
  }
  const ready = response("ready", "failed", options.signal)
  child.stdin?.end(JSON.stringify(options.spec))
  return {
    ready,
    alive: () => child.connected,
    async terminate() {
      kill()
      await completion
    },
    async stop(timeoutMs: number) {
      if (!child.connected) {
        throw new Error("Compose lifecycle worker unavailable; recovery cleanup required")
      }
      const stopped = response("stopped", "stop-failed", AbortSignal.timeout(timeoutMs))
      child.send({ type: "stop" })
      await stopped
      await completion
    },
  }
}
