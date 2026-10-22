import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ExecutionLog } from "@/components/execution-log"
import { ExecutionReview } from "@/components/execution-workspace"
import { EmptyState, Notice } from "@/components/feedback"
import { LiveUpdates } from "@/components/live-updates"
import { ProblemsButton } from "@/components/problems"
import { Toaster } from "@/components/ui/toast"
import { type Api, createApi } from "@/lib/api"
import { navigateReviewLink, readReviewLocation } from "@/lib/workspace-history"
import "@/locales"

const connectedApi = createApi()

export default function ExecutionPage({ api = connectedApi }: { api?: Api }) {
  const { t } = useTranslation()
  const [location, setLocation] = useState(() =>
    readReviewLocation(typeof window === "undefined" ? "" : window.location.search),
  )
  useEffect(() => {
    const update = () => setLocation(readReviewLocation(window.location.search))
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  return (
    <Toaster>
      <main className="execution-viewer min-h-dvh min-w-0 p-4 sm:p-6">
        <nav className="mx-auto mb-4 w-full content-width-768" aria-label={t("Navigation")}>
          <a href="?" onClick={navigateReviewLink} className="text-sm underline underline-offset-4">
            {t("Back to app")}
          </a>
          <ProblemsButton />
        </nav>
        {location.page === "review" && (
          <ExecutionReview key={`${location.kind}:${location.id}`} api={api} execution={location} />
        )}
        {location.page === "history" && (
          <LiveUpdates key={location.worktreeId} worktreeId={location.worktreeId} scope="evidence">
            <section className="mx-auto flex w-full min-w-0 content-width-768 flex-col gap-5">
              <header>
                <h1 className="text-2xl font-semibold">{t("Execution history")}</h1>
                <p className="mt-2 break-all text-sm text-muted-foreground">
                  {location.worktreeId}
                </p>
              </header>
              <ExecutionLog api={api} worktreeId={location.worktreeId} />
            </section>
          </LiveUpdates>
        )}
        {(location.page === "empty" || location.page === "invalid") && (
          <div className="mx-auto w-full content-width-768">
            {location.page === "invalid" && <Notice error>{t("Invalid execution link.")}</Notice>}
            <EmptyState>
              <h1>{t("Open an execution from chat")}</h1>
            </EmptyState>
          </div>
        )}
      </main>
    </Toaster>
  )
}
