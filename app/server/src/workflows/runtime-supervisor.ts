import type { ChildProcess } from "node:child_process"
import { once } from "node:events"
import { valid } from "semver"

async function stopIdle(child: ChildProcess) {
  const status = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("Server did not become idle. Retry after ongoing work finishes.")),
      15000,
    )
    const message = (value: unknown) => {
      if (!value || typeof value !== "object" || !("runtimeControl" in value)) {
        return
      }
      if (value.runtimeControl === "stopped") {
        finish()
      }
      if (value.runtimeControl === "busy") {
        finish(new Error("Active work deferred the update. Try again after it finishes."))
      }
      if (value.runtimeControl === "error") {
        finish(new Error("Server cleanup failed. Quit and reopen Redpact before updating."))
      }
    }
    const gone = () => finish(new Error("Server exited before confirming shutdown"))
    function finish(error?: Error) {
      clearTimeout(timeout)
      child.off("message", message)
      child.off("exit", gone)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    child.on("message", message)
    child.once("exit", gone)
    if (!child.connected) {
      finish(new Error("Server control connection is closed"))
      return
    }
    child.send({ runtimeControl: "update" }, (error) => {
      if (error) {
        finish(error)
      }
    })
  })
  await status
}

export function superviseRuntime(options: {
  start: (error?: string, port?: number) => ChildProcess
  install: (version: string) => Promise<void>
  exit: (code: number) => void
}) {
  let port: number | undefined
  let child: ChildProcess
  let updating = false
  let closing = false
  function send(message: unknown) {
    if (child.connected) {
      child.send(message as object, () => {})
    }
  }
  function start(error?: string) {
    child = options.start(error, port)
    const owned = child
    owned.on("message", (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "runtimeReady" in message &&
        typeof message.runtimeReady === "number" &&
        Number.isInteger(message.runtimeReady) &&
        message.runtimeReady > 0 &&
        message.runtimeReady <= 65535
      ) {
        port = message.runtimeReady
      }
      if (!message || typeof message !== "object" || !("runtimeUpdate" in message)) {
        return
      }
      const version = message.runtimeUpdate
      if (typeof version !== "string" || valid(version) !== version || updating || closing) {
        return
      }
      void update(version)
    })
    owned.on("exit", (code) => {
      if (!updating) {
        options.exit(code ?? 1)
      }
    })
    owned.on("error", () => {
      if (!updating) {
        options.exit(1)
      }
    })
  }
  async function update(version: string) {
    updating = true
    const current = child
    let error: string | undefined
    let stopped = false
    try {
      await stopIdle(current)
      stopped = true
      if (current.exitCode === null && current.signalCode === null) {
        await once(current, "exit", { signal: AbortSignal.timeout(15000) })
      }
      if (!closing) {
        await options.install(version)
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
    if (closing) {
      options.exit(0)
      return
    }
    if (current.exitCode === null && current.signalCode === null) {
      send({
        runtimeUpdateError: error ?? "Server shutdown is incomplete. Quit and reopen Redpact.",
      })
    } else if (stopped) {
      start(error)
    } else {
      options.exit(1)
    }
    updating = false
  }
  start()
  return {
    close() {
      closing = true
      if (child.connected) {
        send({ runtimeControl: "shutdown" })
      } else if (!updating) {
        options.exit(0)
      }
    },
  }
}
