import { EventSource } from "eventsource"

export function createBridge(origin: string) {
  const target = new URL(origin)
  if (
    target.protocol !== "http:" ||
    target.hostname !== "127.0.0.1" ||
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  ) {
    throw new Error("Bridge requires a fixed loopback runtime")
  }
  function url(path: string) {
    if (!path.startsWith("/api/") || path.includes("\\") || /[\r\n#]/.test(path)) {
      throw new Error("Only runtime API paths are allowed")
    }
    const resolved = new URL(path, target)
    if (resolved.origin !== target.origin || !resolved.pathname.startsWith("/api/")) {
      throw new Error("Invalid runtime API path")
    }
    return resolved
  }
  const streams = new Map<
    string,
    { path: string; source: EventSource; revision: number; failed: boolean; touched: number }
  >()
  const cleanup = setInterval(() => {
    for (const [id, stream] of streams) {
      if (Date.now() - stream.touched > 30000) {
        stream.source.close()
        streams.delete(id)
      }
    }
  }, 10000)
  cleanup.unref()
  return {
    async request(path: string, method: string, body?: string) {
      const endpoint = url(path)
      if (endpoint.pathname === "/api/events") {
        throw new Error("Use the scoped events bridge")
      }
      const response = await fetch(endpoint, {
        method,
        body,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      })
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const chunk of response.body ?? []) {
        size += chunk.length
        if (size > 16 * 1024 * 1024) {
          throw new Error("Viewer response exceeds 16 MiB")
        }
        chunks.push(chunk)
      }
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        body: Buffer.concat(chunks).toString("base64"),
      }
    },
    events(id: string, path: string, close = false) {
      const endpoint = url(path)
      if (endpoint.pathname !== "/api/events") {
        throw new Error("Only runtime events are allowed")
      }
      let stream = streams.get(id)
      if (stream && stream.path !== path) {
        throw new Error("Event subscription path cannot change")
      }
      if (close) {
        stream?.source.close()
        streams.delete(id)
        return { revision: 0, failed: false }
      }
      if (!stream) {
        if (streams.size >= 32) {
          throw new Error("Too many event subscriptions")
        }
        stream = {
          path,
          source: new EventSource(endpoint),
          revision: 0,
          failed: false,
          touched: Date.now(),
        }
        const current = stream
        current.source.onmessage = () => {
          current.revision++
          current.failed = false
        }
        current.source.onopen = () => {
          current.failed = false
        }
        current.source.onerror = () => {
          current.failed = true
        }
        current.source.addEventListener("watch-error", () => {
          current.failed = true
        })
        streams.set(id, current)
      }
      stream.touched = Date.now()
      return { revision: stream.revision, failed: stream.failed }
    },
    close() {
      clearInterval(cleanup)
      for (const stream of streams.values()) {
        stream.source.close()
      }
      streams.clear()
    },
  }
}
