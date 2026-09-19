import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { Api, UnitInspection, UnitRun } from "@/lib/api"
import { EmptyState, Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { SearchPicker } from "./search-picker"
import { TestCode } from "./test-code"
import { TestFileBrowser } from "./test-file-browser"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"
import { toast } from "./ui/toast"

export function UnitTests({
  api,
  worktreeId,
  scope = "changed",
  actionsContainer,
}: {
  api: Api
  worktreeId: string
  scope?: "changed" | "all"
  actionsContainer?: HTMLElement | null
}) {
  const { t } = useTranslation()
  function resultLabel(run: UnitRun) {
    switch (run.outcome) {
      case "command_succeeded":
      case "passed":
        return t("Success")
      case "command_failed":
      case "failed":
      case "execution_error":
        return t("Failed")
      case "cancelled":
        return t("cancelled")
      case "interrupted":
        return t("interrupted")
      default:
        return t(run.outcome ?? run.state)
    }
  }
  const revision = useLiveRevision()
  const [data, setData] = useState<UnitInspection>()
  const [path, setPath] = useState("")
  const [runId, setRunId] = useState("")
  const [view, setView] = useState("files")
  const [pending, setPending] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState("")
  useEffect(() => {
    void revision
    void refresh
    const abort = new AbortController()
    void api
      .unitTests(worktreeId, abort.signal, scope)
      .then((result) => {
        if (!abort.signal.aborted) {
          setData(result)
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(String(error))
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, revision, refresh, scope])
  useEffect(() => {
    if (!error) {
      return
    }
    const id = toast.add({ title: error, type: "error", timeout: 5000 })
    return () => toast.close(id)
  }, [error])
  async function action(run?: UnitRun) {
    if (pending) {
      return
    }
    setPending(true)
    try {
      const result = run ? await api.cancelUnitRun(run.id) : await api.runUnitTests(worktreeId)
      setRunId(result.id)
      setView("results")
      setData((previous) =>
        previous
          ? {
              ...previous,
              runs: [result, ...previous.runs.filter((item) => item.id !== result.id)],
            }
          : previous,
      )
      setRefresh((value) => value + 1)
      setError("")
    } catch (error) {
      setError(String(error))
    } finally {
      setPending(false)
    }
  }
  const running = data?.runs.find((run) => run.state === "running")
  const runButton = (
    <Button
      size="toolbar"
      variant="ghost"
      title={t("Runs the configured command in full.")}
      disabled={pending || Boolean(running) || Boolean(error) || !data?.settings}
      onClick={() => void action()}
    >
      {t("Run Unit command")}
    </Button>
  )
  const controls = (
    <div className="flex items-center gap-2">
      {runButton}
      {running && (
        <Button
          size="toolbar"
          variant="ghost"
          disabled={pending}
          onClick={() => void action(running)}
        >
          {t("Cancel command")}
        </Button>
      )}
    </div>
  )
  const toolbar = actionsContainer ? createPortal(controls, actionsContainer) : controls
  if (!data) {
    return (
      <>
        {toolbar}
        {error ? (
          <EmptyState>{t("Unit tests unavailable.")}</EmptyState>
        ) : (
          <Loading>{t("Loading unit tests…")}</Loading>
        )}
      </>
    )
  }
  if (!data.settings && !data.catalog.files.length && !data.runs.length) {
    return (
      <section
        aria-label={t("Unit Test")}
        className="flex h-full min-w-0 flex-col gap-3 overflow-auto"
      >
        {toolbar}
        {data.catalog.diagnostics.map((message) => (
          <Notice key={message}>{message}</Notice>
        ))}
        <EmptyState>
          {t("Configure a unit test Dockerfile, command and file patterns in Project settings.")}
        </EmptyState>
      </section>
    )
  }
  const selected = data.catalog.files.find((file) => file.path === path) ?? data.catalog.files[0]
  const run = data.runs.find((item) => item.id === runId) ?? data.runs[0]
  return (
    <section
      aria-label={t("Unit Test")}
      className="flex h-full min-w-0 flex-col gap-3 overflow-hidden"
    >
      {toolbar}
      {!data.settings && (
        <EmptyState compact>
          {t("Configure a unit test Dockerfile, command and file patterns in Project settings.")}
        </EmptyState>
      )}
      <TestFileBrowser
        mode={scope === "all" ? "project" : "worktree"}
        files={data.catalog.files}
        path={selected?.path ?? ""}
        label={scope === "all" ? t("Unit test files") : t("Changed unit test files")}
        onSelect={(path) => {
          setPath(path)
          setView("files")
        }}
      >
        <Tabs
          value={view}
          onValueChange={(value) => setView(String(value))}
          className="min-h-0 flex-1"
        >
          <TabsList variant="underline" className="shrink-0">
            <TabsTrigger value="files">{t("Code")}</TabsTrigger>
            <TabsTrigger value="results">{t("Command results")}</TabsTrigger>
          </TabsList>
          <TabsContent
            value="files"
            className="flex h-0 min-h-0 min-w-0 flex-col gap-3 overflow-auto"
          >
            {data.catalog.diagnostics.map((message) => (
              <Notice key={message}>{message}</Notice>
            ))}
            {!selected ? (
              <EmptyState>
                {scope === "all" ? t("No unit test files.") : t("No changed unit test files.")}
              </EmptyState>
            ) : (
              <>
                {selected.source !== null ? (
                  <TestCode
                    api={api}
                    worktreeId={worktreeId}
                    scope={scope}
                    baseRevision={data.catalog.baseRevision}
                    source={{ path: selected.path, content: selected.source }}
                  />
                ) : (
                  <Notice>{selected.issue}</Notice>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent
            value="results"
            className="flex h-0 min-h-0 min-w-0 flex-col gap-3 overflow-auto [&>*]:shrink-0"
          >
            {!data.runs.length && <EmptyState>{t("No command runs yet.")}</EmptyState>}
            {data.runs.length > 0 && (
              <>
                <SearchPicker
                  label={t("Command history")}
                  value={run?.id ?? ""}
                  onValueChange={setRunId}
                  options={data.runs.map((item) => ({
                    value: item.id,
                    label: `${new Date(item.createdAt).toLocaleString()} · ${resultLabel(item)}`,
                  }))}
                />
                {run && (
                  <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-sm font-medium">{resultLabel(run)}</p>
                    {run.state === "running" && (
                      <p className="text-sm text-muted-foreground">
                        {t("Output is available when the command finishes.")}
                      </p>
                    )}
                    {run.cleanup?.error && <Notice error>{run.cleanup.error}</Notice>}
                    {run.cleanup?.state === "failed" && (
                      <Button variant="outline" disabled={pending} onClick={() => void action(run)}>
                        {t("Retry container cleanup")}
                      </Button>
                    )}
                    {run.error && <Notice error>{run.error}</Notice>}
                    {run.truncated && <Notice>{t("Command output was truncated.")}</Notice>}
                    {run.stdout && (
                      <section aria-label={t("stdout")}>
                        <pre className="max-h-96 overflow-auto text-code">{run.stdout}</pre>
                      </section>
                    )}
                    {run.stderr && (
                      <section aria-label={t("stderr")}>
                        <pre className="max-h-96 overflow-auto text-code">{run.stderr}</pre>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </TestFileBrowser>
    </section>
  )
}
