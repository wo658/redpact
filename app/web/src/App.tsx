import { useTranslation } from "react-i18next"
import { LanguageSelector } from "@/components/language-selector"
import { Loading, Notice } from "./components/feedback"
import { LiveUpdates } from "./components/live-updates"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import "@/locales"
import { useEffect, useState } from "react"
import { ProjectManager } from "@/components/project-manager"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toast"
import { createApi, type Project } from "@/lib/api"

const api = createApi()

export default function App() {
  return (
    <Toaster>
      <LiveUpdates>
        <div className="desktop-titlebar" data-tauri-drag-region aria-hidden="true" />
        <ConnectedApp />
      </LiveUpdates>
    </Toaster>
  )
}

function ConnectedApp() {
  const { t } = useTranslation()

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries a failed local connection.
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    void api
      .projects(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setProjects(items)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : t("Could not reach the local server."))
        }
      })
    return () => controller.abort()
  }, [attempt, t])

  if (projects) {
    return <ProjectManager api={api} initialProjects={projects} />
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm" size="sm">
        <CardHeader>
          <LanguageSelector />
          <CardTitle>
            <h1>{error ? t("Local server unavailable") : t("Connecting to local Redpact…")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <>
              <Notice error>{error}</Notice>
              <p className="text-sm text-muted-foreground">
                {t("Start the Redpact server, then retry.")}
              </p>
              <Button onClick={() => setAttempt((value) => value + 1)}>
                {t("Retry connection")}
              </Button>
            </>
          ) : (
            <Loading>{t("Loading connected projects.")}</Loading>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
