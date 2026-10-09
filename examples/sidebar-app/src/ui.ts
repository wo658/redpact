import { App } from "@modelcontextprotocol/ext-apps"

const app = new App({ name: "Sidebar Lab", version: "0.1.0" }, {}, { autoResize: true })
function element(selector: string): HTMLElement {
  const result = document.querySelector<HTMLElement>(selector)
  if (!result) {
    throw new Error(`Missing ${selector}`)
  }
  return result
}
const status = element("#status")
const count = element("#count")
const details = element("#details")
const error = element("#error")
const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")]
let ready = false
let busy = false
function controls() {
  for (const button of buttons) {
    button.disabled = !ready || busy
  }
}
function receive(result: { isError?: boolean; structuredContent?: Record<string, unknown> }) {
  if (result.isError) {
    throw new Error("The local MCP tool reported an error. Try Refresh.")
  }
  const value = result.structuredContent
  if (!value || typeof value.count !== "number") {
    throw new Error("The MCP response does not contain a counter snapshot.")
  }
  count.textContent = String(value.count)
  details.textContent = `Process ${value.pid} · ${value.transport} · Started ${value.startedAt}`
  status.textContent = "Connected to local MCP"
}
async function call(name: string) {
  if (busy) {
    return
  }
  busy = true
  controls()
  error.textContent = ""
  try {
    receive(await app.callServerTool({ name, arguments: {} }))
  } catch (failure) {
    error.textContent = failure instanceof Error ? failure.message : String(failure)
    status.textContent = "Request failed"
  } finally {
    busy = false
    controls()
  }
}
for (const button of buttons) {
  button.addEventListener("click", () => {
    if (button.dataset.tool) {
      void call(button.dataset.tool)
    }
  })
}
app.ontoolresult = (result) => {
  try {
    receive(result)
  } catch (failure) {
    error.textContent = String(failure)
  }
}
app.onhostcontextchanged = (context) => {
  if (context.theme) {
    document.documentElement.dataset.theme = context.theme
  }
}
const timer = setTimeout(() => {
  if (!ready) {
    status.textContent = "Waiting for an MCP Apps host"
    error.textContent =
      "Open Sidebar Lab through the installed plugin, or run the browser harness. This HTML requires a host bridge."
  }
}, 5000)
try {
  await app.connect()
  clearTimeout(timer)
  ready = true
  document.documentElement.dataset.theme = app.getHostContext()?.theme ?? "light"
  await call("get_lab_state")
} catch (failure) {
  clearTimeout(timer)
  status.textContent = "Connection failed"
  error.textContent = String(failure)
}
