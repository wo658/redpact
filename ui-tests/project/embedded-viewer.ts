import { expect, type Page } from "@playwright/test"

// Simulate the MCP host boundary; all viewer requests and events use the real fixture server.
// This exercises the shipped sidebar entry and SDK initialization, not the ChatGPT shell.
export async function openEmbeddedViewer(page: Page, projectId: string) {
  await page.addInitScript((id) => {
    if (window.parent !== window) {
      return
    }
    localStorage.setItem("redpact:language", "en")
    localStorage.setItem("redpact:project", id)
    const streams = new Map<string, { source: EventSource; revision: number; failed: boolean }>()
    window.addEventListener("message", async (event) => {
      const message = event.data
      if (
        event.source !== document.querySelector("iframe")?.contentWindow ||
        message?.jsonrpc !== "2.0" ||
        !message.method ||
        message.id === undefined
      ) {
        return
      }
      const reply = (result: unknown) =>
        (event.source as Window).postMessage({ jsonrpc: "2.0", id: message.id, result }, "*")
      if (message.method === "ui/initialize") {
        reply({
          protocolVersion: message.params.protocolVersion,
          hostInfo: { name: "Managed browser host fixture", version: "1" },
          hostCapabilities: { serverTools: {} },
          hostContext: { theme: "light", displayMode: "fullscreen" },
        })
        return
      }
      if (message.method !== "tools/call") {
        return
      }
      try {
        const { name, arguments: args } = message.params
        let meta: Record<string, unknown>
        if (name === "get_redpact_page") {
          meta = {
            page: {
              status: {
                state: "running",
                origin: location.origin,
                owned: false,
                dataDir: "Disposable acceptance fixture",
                logPath: "",
                installation: {
                  state: "installed",
                  version: "fixture",
                  directory: "",
                  logPath: "",
                },
              },
              error: "",
            },
          }
        } else if (name === "redpact_viewer_request") {
          if (typeof args.path !== "string" || !args.path.startsWith("/api/")) {
            throw new Error("Only fixture API requests are supported")
          }
          const response = await fetch(args.path, {
            method: args.method,
            ...(args.body === undefined
              ? {}
              : { body: args.body, headers: { "Content-Type": "application/json" } }),
          })
          const bytes = new Uint8Array(await response.arrayBuffer())
          let binary = ""
          for (const byte of bytes) {
            binary += String.fromCharCode(byte)
          }
          meta = {
            response: {
              status: response.status,
              contentType: response.headers.get("content-type") ?? "application/json",
              body: btoa(binary),
            },
          }
        } else if (name === "redpact_viewer_events") {
          if (args.close) {
            streams.get(args.id)?.source.close()
            streams.delete(args.id)
            meta = {}
          } else {
            let state = streams.get(args.id)
            if (!state) {
              const source = new EventSource(args.path)
              state = { source, revision: 0, failed: false }
              const current = state
              source.onmessage = () => {
                current.revision += 1
              }
              source.onerror = () => {
                current.failed = true
              }
              source.onopen = () => {
                current.failed = false
              }
              streams.set(args.id, state)
            }
            meta = { events: { revision: state.revision, failed: state.failed } }
          }
        } else {
          throw new Error(`Unsupported fixture host action: ${name}`)
        }
        reply({ content: [], _meta: meta })
      } catch (error) {
        reply({ isError: true, content: [{ type: "text", text: String(error) }] })
      }
    })
    window.addEventListener("pagehide", () => {
      for (const stream of streams.values()) {
        stream.source.close()
      }
    })
  }, projectId)
  await page.route("**/embedded-host", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe title="Redpact MCP viewer" src="/embedded-viewer.html"></iframe></body></html>',
    }),
  )
  await page.goto("/embedded-host")
  const viewer = page.frameLocator('iframe[title="Redpact MCP viewer"]')
  await expect(
    viewer
      .locator(".app-header:visible")
      .getByRole("button", { name: "Toggle Sidebar", exact: true }),
  ).toBeVisible()
  return viewer
}
