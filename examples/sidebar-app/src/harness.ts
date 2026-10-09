import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge"

const iframe = document.querySelector<HTMLIFrameElement>("iframe")
if (!iframe?.contentWindow) {
  throw new Error("Missing app frame")
}
const bridge = new AppBridge(
  null,
  { name: "Local test harness", version: "0.1.0" },
  {
    serverTools: {},
    message: {},
    openLinks: {},
  },
  { hostContext: { theme: "light", displayMode: "fullscreen" } },
)
bridge.oncalltool = async (params) => {
  const response = await fetch("/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    throw new Error("Local MCP connection unavailable")
  }
  return response.json()
}
// The harness records host actions; it never sends a real chat message.
bridge.onmessage = async (params) => {
  document.body.dataset.lastMessage = JSON.stringify(params)
  return {}
}
bridge.onopenlink = async ({ url }) => {
  document.body.dataset.lastLink = url
  return {}
}
bridge.oninitialized = () => {
  const query = new URLSearchParams(window.location.search)
  const kind = query.get("kind")
  const id = query.get("id")
  if (kind && id) {
    void (async () => {
      const arguments_ = { kind, id }
      await bridge.sendToolInput({ arguments: arguments_ })
      const response = await fetch("/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "open_redpact_app", arguments: arguments_ }),
      })
      await bridge.sendToolResult(await response.json())
    })()
  }
}
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))
iframe.src = "/app.html"
document.querySelector("#theme")?.addEventListener("click", () => {
  bridge.setHostContext({ theme: "dark", displayMode: "fullscreen" })
})
