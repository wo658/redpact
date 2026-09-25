import { Copy, Minus, Square, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { desktopPlatform, desktopWindow } from "@/lib/desktop"

export function DesktopTitlebar() {
  return (
    <>
      <div className="desktop-titlebar" data-tauri-drag-region aria-hidden="true" />
      {desktopPlatform() === "windows" && <WindowControls />}
    </>
  )
}

function WindowControls() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    let revision = 0
    const refresh = () => {
      const current = ++revision
      void desktopWindow()
        ?.isMaximized()
        .then((value) => {
          if (active && current === revision) {
            setMaximized(value)
          }
        })
        .catch(() => {
          // Actions report IPC errors; a background state refresh should not repeat them.
        })
    }
    refresh()
    window.addEventListener("resize", refresh)
    window.addEventListener("focus", refresh)
    return () => {
      active = false
      window.removeEventListener("resize", refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  async function control(action: "minimize" | "toggleMaximize" | "close") {
    const current = desktopWindow()
    if (!current || busy) {
      return
    }
    setBusy(true)
    try {
      await current[action]()
      if (action === "toggleMaximize") {
        setMaximized(await current.isMaximized())
      }
    } catch {
      toast.add({ title: t("Could not control the window."), type: "error" })
    } finally {
      setBusy(false)
    }
  }

  const maximizeLabel = maximized ? t("Restore window") : t("Maximize window")
  return (
    <div className="native-window-controls">
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        aria-label={t("Minimize window")}
        title={t("Minimize window")}
        onClick={() => void control("minimize")}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        aria-label={maximizeLabel}
        title={maximizeLabel}
        onClick={() => void control("toggleMaximize")}
      >
        {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        aria-label={t("Close window")}
        title={t("Close window")}
        onClick={() => void control("close")}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
