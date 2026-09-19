import { PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, TestContainerInspection } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import type { ProjectEntry } from "../../../server/src/core/types/project-files"
import { Loading, Notice } from "./feedback"
import { FileContent } from "./file-content"
import { useLiveRevision } from "./live-updates"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

export function ProjectTestContainer({ api, projectId }: { api: Api; projectId: string }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState("")
  const [data, setData] = useState<TestContainerInspection>()
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (pending) {
      return
    }
    const control = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await api.testContainer(projectId, control.signal)
        if (!control.signal.aborted) {
          setData(next)
          setLoadError("")
        }
      } catch (error) {
        if (!control.signal.aborted) {
          setLoadError(String(error))
        }
      } finally {
        if (!control.signal.aborted) {
          timer = setTimeout(() => void refresh(), 5000)
        }
      }
    }
    void refresh()
    return () => {
      control.abort()
      clearTimeout(timer)
    }
  }, [api, projectId, pending])
  async function action(action: "start" | "restart" | "stop") {
    if (pending) {
      return
    }
    setPending(true)
    setError("")
    try {
      setData(await api.testContainerAction(projectId, action))
    } catch (error) {
      setError(String(error))
    } finally {
      setPending(false)
    }
  }
  if (!data) {
    return loadError ? <Notice error>{loadError}</Notice> : <Loading>{t("Loading…")}</Loading>
  }
  return (
    <TestContainerView
      data={data}
      pending={pending}
      error={error || loadError}
      onAction={action}
      selectedFile={selected}
      onSelectFile={setSelected}
    >
      {selected && data.composeFiles.includes(selected) && (
        <ComposePreview
          key={`${data.target?.id}:${selected}`}
          api={api}
          projectId={projectId}
          path={selected}
          onClose={() => setSelected("")}
        />
      )}
    </TestContainerView>
  )
}

export function TestContainerView({
  data,
  pending,
  error,
  onAction,
  onSelectFile,
  selectedFile,
  children,
}: {
  data: TestContainerInspection
  pending: boolean
  error: string
  onAction: (action: "start" | "restart" | "stop") => void
  onSelectFile?: (path: string) => void
  selectedFile?: string
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { target, environment, changed, issue, composeFiles } = data
  const transitioning = environment?.state === "preparing" || environment?.state === "stopping"
  const ready = environment?.state === "ready"
  return (
    <section
      aria-label={t("Container")}
      className="@container mx-auto flex w-full min-w-0 content-width-768 flex-col gap-4 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{environment ? t(environment.state) : t("Stopped")}</Badge>
          {changed === true && <Badge variant="outline">{t("Local changes available")}</Badge>}
          {changed === false && <Badge variant="outline">{t("Up to date")}</Badge>}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {!environment ? (
            <Button
              size="toolbar"
              disabled={pending || !target || Boolean(issue)}
              onClick={() => onAction("start")}
            >
              <PlayIcon data-icon="inline-start" />
              {t("Start")}
            </Button>
          ) : (
            <>
              <Button
                size="toolbar"
                variant="ghost"
                disabled={pending || transitioning || !target || Boolean(issue)}
                onClick={() => onAction("restart")}
              >
                <RotateCwIcon data-icon="inline-start" />
                {t("Restart with latest code")}
              </Button>
              <Button
                size="toolbar"
                variant="ghost"
                disabled={pending || environment.state === "stopping"}
                onClick={() => onAction("stop")}
              >
                <SquareIcon data-icon="inline-start" />
                {t("Stop")}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {issue && <Notice error>{t(issue)}</Notice>}
      {environment?.errors.map((message) => (
        <Notice key={message} error>
          {message}
        </Notice>
      ))}
      <dl className="divide-y divide-border border-y border-border text-sm">
        {target && <ContainerRow label={t("Main branch")}>{target.branch ?? "—"}</ContainerRow>}
        <ContainerRow label={t("Compose files")}>
          {composeFiles.length ? (
            <ul className="flex flex-col gap-2">
              {composeFiles.map((file) => (
                <li key={file}>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                    aria-expanded={selectedFile === file}
                    onClick={() => onSelectFile?.(file)}
                  >
                    {file}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            "—"
          )}
        </ContainerRow>
        {ready &&
          Object.entries(environment.endpoints).map(([name, endpoint]) => {
            const binding = Object.values(environment.specification.tests.env).find(
              (value) =>
                typeof value === "object" &&
                "service" in value &&
                `${value.service}:${value.port}` === name,
            )
            const browser = environment.specification.playwright
            let scheme: string | undefined
            if (binding && typeof binding === "object" && "service" in binding) {
              scheme = binding.scheme ?? "http"
            } else if (browser && `${browser.service}:${browser.port}` === name) {
              scheme = "http"
            }
            return (
              <ContainerRow key={name} label={name}>
                {scheme ? (
                  <a
                    className="break-all underline underline-offset-4"
                    href={`${scheme}://${endpoint.host}:${endpoint.port}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {`${scheme}://${endpoint.host}:${endpoint.port}`}
                  </a>
                ) : (
                  <span>{`${endpoint.host}:${endpoint.port}`}</span>
                )}
              </ContainerRow>
            )
          })}
      </dl>
      {children}
    </section>
  )
}

function ContainerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 py-3 @sm:grid-cols-[140px_minmax(0,1fr)] @sm:gap-4">
      <dt className="break-words text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  )
}

function ComposePreview({
  api,
  projectId,
  path,
  onClose,
}: {
  api: Api
  projectId: string
  path: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<ProjectEntry | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const revision = useLiveRevision()
  const read = useCallback(
    async (signal: AbortSignal) => {
      setError("")
      try {
        const result = await api.testContainerCompose(projectId, path, signal)
        if (!signal.aborted) {
          setFile(result)
        }
      } catch (error) {
        if (!signal.aborted) {
          setFile(null)
          setError(String(error))
        }
      }
    },
    [api, projectId, path],
  )
  useRefreshRequest(read, revision, attempt)
  return (
    <section
      aria-label={path}
      className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-md border"
    >
      <div className="flex justify-end border-b p-1">
        <Button variant="ghost" size="toolbar" onClick={onClose}>
          {t("Close")}
        </Button>
      </div>
      {error && (
        <Notice error>
          {error}
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("Retry")}
          </Button>
        </Notice>
      )}
      {!file && !error && <Loading>{t("Loading…")}</Loading>}
      {file && <FileContent entry={file} />}
    </section>
  )
}
