import { ArrowUpCircle, LoaderCircle, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { desktopInvoke } from "@/lib/desktop"

type UpdateStatus = { version: string | null; busy: boolean }

export function DesktopUpdate() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateStatus>({ version: null, busy: false })
  const [requesting, setRequesting] = useState(false)
  const pending = useRef(false)
  const invoke = desktopInvoke()

  useEffect(() => {
    if (!invoke) {
      return
    }
    const call = invoke
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await call<UpdateStatus>("desktop_update_status")
        if (!disposed) {
          setStatus(next)
        }
      } catch {
        // Failed reads clear the version indicator; the manual check remains available.
        if (!disposed) {
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
    }
  }, [invoke])

  if (!invoke) {
    return null
  }
  const busy = requesting || status.busy
  async function install() {
    if (pending.current || busy || !invoke) {
      return
    }
    pending.current = true
    setRequesting(true)
    try {
      await invoke("desktop_install_update")
      setStatus(await invoke<UpdateStatus>("desktop_update_status"))
    } catch {
      toast.add({ title: t("Could not request the update. Try again."), type: "error" })
    } finally {
      pending.current = false
      setRequesting(false)
    }
  }
  let icon = <RefreshCw aria-hidden="true" />
  if (status.version) {
    icon = <ArrowUpCircle aria-hidden="true" />
  }
  if (busy) {
    icon = <LoaderCircle className="animate-spin" aria-hidden="true" />
  }
  const label = status.version
    ? t("Update to {{version}}", { version: status.version })
    : t("Check for updates")
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon" disabled={busy} />}
        onClick={() => void install()}
        aria-label={label}
        aria-busy={busy}
        className="relative"
      >
        {icon}
        {status.version && (
          <span
            className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </TooltipTrigger>
      <TooltipContent role="tooltip">{label}</TooltipContent>
    </Tooltip>
  )
}
