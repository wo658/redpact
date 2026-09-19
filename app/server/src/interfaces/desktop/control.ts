import { createInterface } from "node:readline"
import type { Readable } from "node:stream"
import { setTimeout as delay } from "node:timers/promises"

// This private parent pipe is deliberately not exposed through HTTP or a WebView capability.
export function createDesktopControl(options: {
  input: Readable
  busy: () => boolean
  stop: () => Promise<void>
  send: (message: { desktop: string; error?: string }) => void
}) {
  let draining = false
  let active = 0
  let closed = false
  let parentGone = false
  const lines = createInterface({ input: options.input, terminal: false })
  async function shutdown(onlyIdle: boolean) {
    if (draining) {
      return
    }
    draining = true
    try {
      if (onlyIdle) {
        const deadline = Date.now() + 10000
        while (active && !parentGone && Date.now() < deadline) {
          await delay(20)
        }
        if (!parentGone && (active || options.busy())) {
          draining = false
          options.send({ desktop: "busy" })
          return
        }
      }
      closed = true
      lines.close()
      options.input.destroy()
      await options.stop()
      if (!parentGone) {
        options.send({ desktop: "stopped" })
      }
    } catch (error) {
      if (!parentGone) {
        options.send({ desktop: "error", error: String(error) })
      }
      process.exitCode = 1
    }
  }
  lines.on("line", (line) => {
    if (line === "shutdown" || line === "update") {
      void shutdown(line === "update")
    }
  })
  lines.on("close", () => {
    if (!closed) {
      parentGone = true
      void shutdown(false)
    }
  })
  return {
    async fetch(next: () => Response | Promise<Response>): Promise<Response> {
      if (draining) {
        return new Response("Redpact is restarting", { status: 503 })
      }
      active++
      try {
        return await next()
      } finally {
        active--
      }
    },
    close() {
      closed = true
      lines.close()
      options.input.destroy()
    },
  }
}
