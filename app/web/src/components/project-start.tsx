import { FolderOpen } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api } from "@/lib/api"
import { BrandWordmark } from "./brand-wordmark"
import { Notice } from "./feedback"
import { Button } from "./ui/button"
import { Spinner } from "./ui/spinner"

export function ProjectStart({
  pending,
  error = "",
  onConnect,
  pickDirectory,
  onManage,
}: {
  pickDirectory: Api["pickDirectory"]
  onManage?: () => void
  pending: boolean
  error?: string
  onConnect: (path: string, name?: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<"idle" | "picking" | "connecting">("idle")
  const [pickerError, setPickerError] = useState("")
  const request = useRef<AbortController | null>(null)
  const busy = pending || phase !== "idle"
  useEffect(() => () => request.current?.abort(), [])

  async function openProject() {
    if (pending || request.current) {
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPickerError("")
    setPhase("picking")
    try {
      const { path } = await pickDirectory(controller.signal)
      if (controller.signal.aborted || path === null) {
        return
      }
      setPhase("connecting")
      await onConnect(path)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setPickerError(
          cause instanceof Error ? cause.message : t("Could not open the project. Try again."),
        )
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null
        setPhase("idle")
      }
    }
  }

  let label = t("Open project folder")
  if (pending || phase === "connecting") {
    label = t("Connecting project…")
  } else if (phase === "picking") {
    label = t("Opening folder picker…")
  }
  const visibleError = pickerError || (phase === "idle" ? error : "")
  return (
    <main className="flex min-h-dvh w-full flex-col bg-background px-6 py-8">
      <section
        aria-label={t("Connect project")}
        className="m-auto flex w-full max-w-lg justify-center"
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <h1 className="mb-4 text-3xl text-foreground">
            <BrandWordmark />
          </h1>
          <Button onClick={() => void openProject()} disabled={busy}>
            {busy ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <FolderOpen aria-hidden="true" data-icon="inline-start" />
            )}
            {label}
          </Button>
          {phase === "picking" && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Choose a folder in the system window.")}
            </p>
          )}
          {visibleError && <Notice error>{visibleError}</Notice>}
          {onManage && (
            <Button variant="ghost" onClick={onManage}>
              {t("Manage projects")}
            </Button>
          )}
        </div>
      </section>
    </main>
  )
}
