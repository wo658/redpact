import "./sidebar-csp"
import { createRoot } from "react-dom/client"
import App from "../App"
import { initialize } from "../lib/sidebar-runtime"
import { ThemeProvider } from "../lib/theme"
import { setViewerTransport, type ViewerEvents } from "../lib/viewer-transport"
import "../index.css"

type Call = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
function events(call: Call, path: string): ViewerEvents {
  const id = crypto.randomUUID()
  let closed = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout>
  const target = new EventTarget()
  const stream: ViewerEvents = {
    onmessage: null,
    onerror: null,
    addEventListener: target.addEventListener.bind(target),
    close() {
      closed = true
      clearTimeout(timer)
      void call("redpact_viewer_events", { id, path, close: true }).catch(() => {})
    },
  }
  async function poll() {
    try {
      const result = await call("redpact_viewer_events", { id, path })
      if (closed) {
        return
      }
      const state = result.events as { revision: number; failed: boolean }
      if (state.failed) {
        throw new Error("Live updates unavailable")
      }
      if (state.revision !== revision) {
        revision = state.revision
        stream.onmessage?.(new MessageEvent("message"))
      }
    } catch {
      if (!closed) {
        stream.onerror?.(new Event("error"))
      }
    } finally {
      if (!closed) {
        timer = setTimeout(() => void poll(), 1000)
      }
    }
  }
  void poll()
  return stream
}
void initialize((call) => {
  setViewerTransport({
    async fetch(input, init) {
      init?.signal?.throwIfAborted()
      if (typeof input !== "string" || !input.startsWith("/api/")) {
        throw new Error("Only Redpact API requests are supported")
      }
      const result = await call("redpact_viewer_request", {
        path: input,
        method: init?.method ?? "GET",
        body: init?.body,
      })
      init?.signal?.throwIfAborted()
      const response = result.response as { status: number; contentType: string; body: string }
      const bytes = Uint8Array.from(atob(response.body), (value) => value.charCodeAt(0))
      return new Response(response.status === 204 ? null : bytes, {
        status: response.status,
        headers: { "Content-Type": response.contentType },
      })
    },
    events: (path) => events(call, path),
  })
  const element = document.getElementById("root")
  if (!element) {
    throw new Error("Viewer root unavailable")
  }
  const root = createRoot(element)
  root.render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  )
  return () => root.unmount()
})
