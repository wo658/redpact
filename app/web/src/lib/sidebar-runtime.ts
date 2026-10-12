import { App } from "@modelcontextprotocol/ext-apps"
import type { RuntimeState } from "./sidebar-runtime-model.js"

type Page = { status: RuntimeState; error: string }

export async function initialize(
  mount: (
    call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ) => () => void,
) {
  function hostElement(id: string) {
    const value = document.getElementById(id)
    if (!value) {
      throw new Error(`Missing #${id}`)
    }
    return value
  }
  const setup = hostElement("setup")
  const source = document.getElementById("setup-template")
  const viewerRoot = hostElement("root")
  if (!(source instanceof HTMLTemplateElement)) {
    throw new Error("App resource is incomplete")
  }
  const shadow = setup.attachShadow({ mode: "open" })
  shadow.append(source.content.cloneNode(true))
  let dispose: (() => void) | undefined
  async function call(name: string, args: Record<string, unknown>) {
    const result = await app.callServerTool({ name, arguments: { ...args, token } })
    if (result.isError) {
      throw new Error(JSON.stringify(result.content))
    }
    return result._meta ?? {}
  }
  function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const value = shadow.getElementById(id)
    if (!value) {
      throw new Error(`Missing #${id}`)
    }
    return value as T
  }
  const app = new App({ name: "Redpact", version: "0.5.4" }, {}, { autoResize: false })
  let page: Page | undefined
  let token = ""
  let busy = false
  let activeAction = ""
  let poll: ReturnType<typeof setTimeout> | undefined
  let ready = false
  const error = element("error")
  function controls() {
    setup.hidden = page?.status.state === "running" && !error.textContent
    document.body.dataset.recovery = String(Boolean(error.textContent))
    const connected = page?.status.state === "running"
    const installed = page?.status.installation?.state === "installed"
    const blocked = page?.status.state === "blocked"
    const recovery = Boolean(error.textContent) || blocked
    element("start-actions").hidden = connected || !installed || blocked
    element("refresh").hidden = !recovery
    element("stop").hidden = !connected || !page?.status.owned || !recovery
    element("runtime-details").hidden = connected || (!installed && !blocked)
    element<HTMLButtonElement>("refresh").disabled = !ready || busy
    element<HTMLButtonElement>("start").disabled =
      !ready ||
      busy ||
      page?.status.state !== "stopped" ||
      page?.status.installation?.state !== "installed"
    element<HTMLButtonElement>("stop").disabled = !ready || busy || !page?.status.owned
    element("start").textContent =
      activeAction === "start_redpact_server" ? "Starting…" : "Start Redpact"
    element<HTMLButtonElement>("install").disabled =
      !ready || busy || page?.status.installation?.state === "installing"
    element<HTMLSelectElement>("manager").disabled =
      !ready || busy || page?.status.installation?.state === "installing"
    element("install").textContent =
      page?.status.installation?.state === "installing" ? "Installing…" : "Install Redpact"
    if (page?.status.installation?.state === "failed") {
      element("install").textContent = "Try again"
    }
    element("stop").textContent =
      activeAction === "stop_redpact_server" ? "Stopping…" : "Stop Redpact"
  }
  function schedule() {
    clearTimeout(poll)
    poll = setTimeout(
      () => void refresh(),
      page?.status.installation?.state === "installing" ? 1000 : 5000,
    )
  }
  function render(value: Page) {
    const installation = value.status.installation
    const connected = value.status.state === "running"
    element("installation").hidden =
      connected || !installation || installation.state === "installed"
    const titles = {
      missing: "Welcome to Redpact",
      installing: "Installing Redpact…",
      installed: "Redpact is ready",
      failed: "Installation failed",
    }
    element("offline-title").textContent = titles[installation?.state ?? "installed"]
    element("runtime-message").hidden = value.status.state !== "blocked"
    element("runtime-message").textContent = ""
    if (value.status.state === "blocked") {
      element("offline-title").textContent = "Unable to connect"
      element("runtime-message").textContent = value.status.message
    }
    if (installation) {
      element("install-status").hidden = installation.state !== "failed"
      const labels = {
        missing: `Redpact ${installation.version} is not installed for this plugin.`,
        installing: `Installing Redpact ${installation.version}…`,
        installed: `Redpact ${installation.version} is installed.`,
        failed: installation.error,
      }
      element("install-status").textContent = labels[installation.state]
      element("install-directory").textContent = installation.directory
      element("install-log").textContent = installation.logPath
    }
    page = value
    let ownership = "Plugin-managed runtime · Install with npm or pnpm when missing."
    if (value.status.owned) {
      ownership =
        "Plugin-managed server · Stop Redpact shuts down this runtime and its active work."
    } else if (connected) {
      ownership = "External server · Stop it from the app or session that started it."
    }
    element("ownership").textContent = ownership
    const labels = {
      running: "Server connected",
      stopped: "Server stopped",
      blocked: "Connection blocked",
    }
    element("status").textContent = labels[value.status.state]
    element("status").dataset.state = value.status.state
    document.body.dataset.running = String(connected)
    setup.dataset.running = String(connected)
    viewerRoot.hidden = !connected
    if (connected && !dispose) {
      dispose = mount(call)
    }
    if (!connected && dispose) {
      dispose()
      dispose = undefined
    }
    element("offline").hidden = connected
    element("viewer").hidden = !connected
    element("command").textContent = value.status.origin
    element("data-dir").textContent = value.status.dataDir
    element("log-path").textContent = value.status.logPath
    error.textContent = value.error
    controls()
  }
  function receive(result: {
    isError?: boolean
    _meta?: Record<string, unknown>
    content?: unknown
  }) {
    if (result.isError) {
      throw new Error(JSON.stringify(result.content))
    }
    const reviewPath = result._meta?.reviewPath
    if (
      typeof reviewPath === "string" &&
      /^\/\?page=review&kind=(unit|integration|playwright)&id=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        reviewPath,
      )
    ) {
      window.history.replaceState(null, "", reviewPath)
      window.dispatchEvent(new PopStateEvent("popstate"))
    }
    if (typeof result._meta?.controlToken === "string") {
      token = result._meta.controlToken
    }
    if (result._meta?.page) {
      render(result._meta.page as Page)
    }
  }
  async function invoke(name: string, args: Record<string, unknown> = {}) {
    if (busy) {
      schedule()
      return
    }
    busy = true
    activeAction = name
    controls()
    error.textContent = ""
    try {
      receive(await app.callServerTool({ name, arguments: args }))
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : String(failure)
      if (name === "get_redpact_page") {
        element("status").textContent = "Refresh failed · showing previous data"
      }
    } finally {
      busy = false
      activeAction = ""
      controls()
      schedule()
    }
  }
  function refresh() {
    return invoke("get_redpact_page")
  }
  element("refresh").addEventListener("click", () => {
    void refresh()
  })
  element("start").addEventListener("click", () => void invoke("start_redpact_server", { token }))
  element("install").addEventListener(
    "click",
    () =>
      void invoke("install_redpact_runtime", {
        token,
        manager: element<HTMLSelectElement>("manager").value,
      }),
  )
  element("stop").addEventListener("click", () => void invoke("stop_redpact_server", { token }))
  element("viewer").addEventListener("click", () => {
    if (page) {
      void app
        .openLink({
          url: `${page.status.origin}${window.location.pathname}${window.location.search}`,
        })
        .catch((failure) => {
          error.textContent = String(failure)
        })
    }
  })
  app.ontoolresult = (result) => {
    try {
      receive(result)
    } catch (failure) {
      error.textContent = String(failure)
    }
  }
  function applyHostTheme(theme: "light" | "dark") {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
    setup.dataset.theme = theme
  }
  app.onhostcontextchanged = (context) => {
    if (context.theme) {
      applyHostTheme(context.theme)
    }
  }
  window.addEventListener("pagehide", () => {
    clearTimeout(poll)
    dispose?.()
  })
  try {
    await app.connect()
    ready = true
    applyHostTheme(app.getHostContext()?.theme ?? "light")
    await refresh()
  } catch (failure) {
    error.textContent = `Host connection failed: ${String(failure)}`
    element("offline-title").textContent = "Unable to connect"
    element("runtime-message").hidden = false
    element("runtime-message").textContent = "Reopen Redpact to reconnect."
    controls()
  }
}
