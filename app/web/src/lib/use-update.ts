import { useEffect, useRef, useState } from "react"
import { desktopInvoke } from "./desktop"

export type UpdateStatus = {
  version: string | null
  busy: boolean
  currentVersion?: string
  canInstall?: boolean
  installError?: string | null
  supported?: boolean
  error?: string | null
}

async function runtimeStatus(check = false): Promise<UpdateStatus> {
  const response = await fetch(check ? "/api/updates/check" : "/api/updates", {
    method: check ? "POST" : "GET",
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) {
    throw new Error(`Update service returned HTTP ${response.status}`)
  }
  return response.json()
}

async function installRuntime(version: string | null): Promise<UpdateStatus> {
  const response = await fetch("/api/updates/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: version }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const failure = await response.json()
    throw new Error(failure.error ?? "Update was not accepted")
  }
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    let next: UpdateStatus
    try {
      next = await runtimeStatus()
    } catch {
      continue
    }
    if (next.installError) {
      throw new Error(next.installError)
    }
    if (next.currentVersion === version) {
      window.location.reload()
      return next
    }
  }
  throw new Error("Update could not be confirmed. Reopen Redpact and check its version.")
}

const changed = "redpact:update-status"

export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ version: null, busy: false })
  const [error, setError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const pending = useRef(false)
  const revision = useRef(0)
  const invoke = desktopInvoke()
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const receive = (event: Event) => {
      revision.current++
      setStatus((event as CustomEvent<UpdateStatus>).detail)
    }
    window.addEventListener(changed, receive)
    async function refresh() {
      const observed = revision.current
      try {
        const next = invoke
          ? await invoke<UpdateStatus>("desktop_update_status")
          : await runtimeStatus()
        if (!disposed && !pending.current && observed === revision.current) {
          setStatus(next)
        }
      } catch {
        if (!disposed && !pending.current && observed === revision.current) {
          setStatus({ version: null, busy: false })
        }
      } finally {
        if (!disposed) {
          timer = setTimeout(refresh, 5000)
        }
      }
    }
    void refresh()
    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener(changed, receive)
    }
  }, [invoke])
  async function request(command: "desktop_check_update" | "desktop_install_update") {
    if (pending.current || status.busy) {
      return
    }
    pending.current = true
    setRequesting(true)
    setError(null)
    try {
      if (!invoke && command === "desktop_install_update") {
        return await installRuntime(status.version)
      }
      if (invoke) {
        await invoke(command)
      }
      const next = invoke
        ? await invoke<UpdateStatus>("desktop_update_status")
        : await runtimeStatus(true)
      setError(next.error ?? null)
      window.dispatchEvent(new CustomEvent(changed, { detail: next }))
      return next.error ? undefined : next
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      pending.current = false
      setRequesting(false)
    }
  }
  return {
    status,
    error: error ?? status.installError ?? status.error ?? null,
    native: Boolean(invoke),
    busy: status.busy || requesting,
    check: () => request("desktop_check_update"),
    install: () => request("desktop_install_update"),
  }
}
