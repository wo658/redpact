import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, ExecutionSummary, Page } from "@/lib/api"
import { EmptyState, Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { ButtonGroup } from "./ui/button-group"

export function ExecutionLog({ api, worktreeId }: { api: Api; worktreeId: string }) {
  const { t } = useTranslation()
  const [before, setBefore] = useState("")
  const [page, setPage] = useState<Page<ExecutionSummary> | null>(null)
  const [error, setError] = useState("")
  const liveRevision = useLiveRevision()
  useEffect(() => {
    void liveRevision
    const abort = new AbortController()
    api
      .executionLogs(worktreeId, before, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setPage(result)
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : t("Could not load execution"))
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, before, liveRevision, t])
  function navigate(cursor: string) {
    setPage(null)
    setError("")
    setBefore(cursor)
  }
  return (
    <section
      aria-label={t("Execution logs")}
      className="mx-auto flex min-h-full w-full min-w-0 content-width-768 flex-col gap-3"
    >
      {error && (
        <Notice error>{t("{{error}} · Displayed evidence may be outdated.", { error })}</Notice>
      )}
      {!page && !error && <Loading>{t("Loading execution…")}</Loading>}
      {page && !page.items.length && <EmptyState>{t("No executions yet")}</EmptyState>}
      {page && page.items.length > 0 && (
        <ul aria-label={t("Execution")} className="min-w-0 divide-y">
          {page.items.map((run) => (
            <ExecutionRow key={`${run.kind}:${run.id}`} api={api} run={run} />
          ))}
        </ul>
      )}
      <ButtonGroup aria-label={t("Execution")}>
        {before && (
          <Button size="sm" variant="ghost" onClick={() => navigate("")}>
            {t("Newest executions")}
          </Button>
        )}
        {page?.nextCursor && (
          <Button size="sm" variant="ghost" onClick={() => navigate(page.nextCursor ?? "")}>
            {t("Older executions")}
          </Button>
        )}
      </ButtonGroup>
    </section>
  )
}
const labels = { unit: "Unit", integration: "Integration", playwright: "Playwright" } as const
function ExecutionRow({ api, run }: { api: Api; run: ExecutionSummary }) {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  async function copy() {
    request.current?.abort()
    const abort = new AbortController()
    request.current = abort
    setPending(true)
    setCopied(false)
    setError("")
    try {
      const result = await api.copyExecutionLog(run.kind, run.id, abort.signal)
      if (abort.signal.aborted) {
        return
      }
      await navigator.clipboard.writeText(result.text)
      if (!abort.signal.aborted) {
        setCopied(true)
      }
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : t("Could not copy log"))
      }
    } finally {
      if (!abort.signal.aborted) {
        setPending(false)
      }
    }
  }
  return (
    <li className="flex min-w-0 flex-col gap-2 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{run.intent}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline">{t(labels[run.kind])}</Badge>
            <span className="[overflow-wrap:anywhere]">{t(run.outcome ?? run.state)}</span>
            <time
              dateTime={run.createdAt}
              title={new Date(run.createdAt).toLocaleString(i18n.resolvedLanguage)}
              className="tabular-nums"
            >
              {new Date(run.createdAt).toLocaleString(i18n.resolvedLanguage, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={() => void copy()}
          aria-label={copied ? t("Copied") : t("Copy log: {{name}}", { name: run.intent })}
          title={t("Copy log")}
        >
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
        </Button>
        <span className="sr-only" role="status">
          {copied ? t("Copied") : ""}
        </span>
      </div>
      {error && <Notice error>{error}</Notice>}
    </li>
  )
}
