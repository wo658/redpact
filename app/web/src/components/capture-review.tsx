import { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { Api, CaptureArtifact, CaptureRun } from "@/lib/api"
import { captureFiles, captureMatchesMode, captureRunMatchesMode } from "@/lib/review-content"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { EmptyState, Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { TestFileBrowser } from "./test-file-browser"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Field, FieldLabel } from "./ui/field"
import { Switch } from "./ui/switch"

type CaptureReviewProps = { api: Api; worktreeId: string; actionsContainer?: HTMLElement | null }
export function CaptureReview(props: CaptureReviewProps) {
  return <WorktreeCaptureReview key={props.worktreeId} {...props} />
}
function WorktreeCaptureReview({ api, worktreeId, actionsContainer }: CaptureReviewProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<Awaited<ReturnType<Api["playwright"]>> | null>(null)
  const [catalog, setCatalog] = useState<Awaited<
    ReturnType<Api["worktreePlaywrightCatalog"]>
  > | null>(null)
  const [catalogError, setCatalogError] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [selectedFile, setSelectedFile] = useState("")
  const [selectedRun, setSelectedRun] = useState("")
  const [mobileMode, setMobileMode] = useState(false)
  const revision = useLiveRevision()
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [execution, review] = await Promise.allSettled([
          api.playwright(worktreeId, signal),
          api.worktreePlaywrightCatalog(worktreeId, signal),
        ])
        if (signal.aborted) {
          return
        }
        if (execution.status === "fulfilled") {
          setData(execution.value)
          setError("")
        } else {
          setData(null)
          setError(String(execution.reason))
        }
        if (review.status === "fulfilled") {
          setCatalog(review.value)
          setCatalogError("")
        } else {
          setCatalog(null)
          setCatalogError(
            review.reason instanceof Error ? review.reason.message : String(review.reason),
          )
        }
      } catch (e) {
        if (!signal.aborted) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    },
    [api, worktreeId],
  )
  useRefreshRequest(refresh, revision)
  const targetNames = Object.entries(data?.settings?.targets ?? {})
    .filter(([, value]) => value.purpose === "capture")
    .map(([name]) => name)
  const reviewRuns = (data?.runs ?? [])
    .filter((item) => item.purpose === "capture")
    .map((item) => ({
      ...item,
      after: {
        ...item.after,
        cases: item.after.cases.filter((scenario) =>
          catalog?.files.some((file) => file.path === scenario.file && file.target === item.target),
        ),
      },
    }))
    .filter(
      (item) =>
        item.after.cases.length > 0 || item.state !== "finished" || Boolean(item.cleanupError),
    )
  const files = [...new Set(captureFiles(catalog?.files ?? []).map((file) => file.path))].map(
    (path) => ({
      path,
    }),
  )
  const path = files.find((file) => file.path === selectedFile)?.path ?? files[0]?.path ?? ""
  const target = catalog?.files.find((file) => file.path === path)?.target ?? targetNames[0]
  const viewport = mobileMode
    ? (data?.settings?.mobileViewport ?? { width: 390, height: 844 })
    : (data?.settings?.viewport ?? { width: 1920, height: 1080 })
  const fileRuns = reviewRuns.filter(
    (item) =>
      item.target === target &&
      item.after.cases.some((scenario) => scenario.file === path) &&
      captureRunMatchesMode(item, path, mobileMode),
  )
  const activeRun = data?.runs.find((item) => item.state !== "finished" || item.cleanupError)
  const run = fileRuns.find((item) => item.id === selectedRun) ?? fileRuns[0] ?? activeRun
  const cases =
    run?.after.cases
      .filter((scenario) => scenario.file === path)
      .map((scenario) => ({
        ...scenario,
        artifacts: scenario.artifacts.filter(
          (artifact) =>
            artifact.contentType !== "image/png" || captureMatchesMode(artifact, mobileMode),
        ),
      })) ?? []
  async function cleanupWorktree() {
    setPending(true)
    setError("")
    try {
      await api.cleanupPlaywrightWorktree(worktreeId)
      await refresh(new AbortController().signal)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  async function execute(cancel = false) {
    if (!worktreeId) {
      return
    }
    setPending(true)
    setError("")
    try {
      const next =
        cancel && activeRun
          ? await api.cancelPlaywright(activeRun.id)
          : await api.runPlaywright(worktreeId, undefined, viewport, target)
      setSelectedRun(next.id)
      setData((value) =>
        value ? { ...value, runs: [next, ...value.runs.filter((r) => r.id !== next.id)] } : value,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const controls = (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
      <Field orientation="horizontal" className="w-auto shrink-0">
        <Switch
          id="mobile-mode"
          checked={mobileMode}
          onCheckedChange={(checked) => {
            setMobileMode(checked)
            setSelectedRun("")
          }}
        />
        <FieldLabel htmlFor="mobile-mode">{t("Mobile")}</FieldLabel>
      </Field>
      {worktreeId && (
        <>
          <Button
            size="toolbar"
            variant="ghost"
            disabled={
              pending ||
              !target ||
              !data?.settings ||
              !catalog ||
              Boolean(data.error) ||
              data?.runs.some((item) => item.state !== "finished" || Boolean(item.cleanupError))
            }
            onClick={() => void execute()}
          >
            {t("Run Playwright")}
          </Button>
          {data?.runs.some((item) => item.scope === "worktree") && (
            <Button
              size="toolbar"
              variant="ghost"
              disabled={
                pending ||
                data.runs.some((item) => item.state !== "finished" || Boolean(item.cleanupError))
              }
              onClick={() => void cleanupWorktree()}
            >
              {t("Clean up worktree code")}
            </Button>
          )}
          {activeRun && (
            <Button
              size="toolbar"
              variant="outline"
              disabled={pending}
              onClick={() => void execute(true)}
            >
              {t(activeRun.cleanupError ? "Retry cleanup" : "Cancel")}
            </Button>
          )}
        </>
      )}
    </div>
  )
  return (
    <section
      aria-label={t("UI Review")}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      {actionsContainer && createPortal(controls, actionsContainer)}
      <TestFileBrowser
        files={files}
        path={path}
        label={t("Playwright files")}
        onSelect={(next) => {
          setSelectedFile(next)
          setSelectedRun("")
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {!actionsContainer && controls}
          {run && (
            <span className="text-xs text-muted-foreground">
              {run.settings.viewport.width} × {run.settings.viewport.height}
            </span>
          )}
          {error && <Notice error>{error}</Notice>}
          {data?.error && <Notice error>{data.error}</Notice>}
          {catalogError && <Notice error>{catalogError}</Notice>}
          {catalog?.diagnostics.map((message) => (
            <Notice key={message} error>
              {message}
            </Notice>
          ))}
          {run && (
            <>
              {data?.inputDigest && run.appDigest !== data.inputDigest && (
                <Badge variant="secondary">{t("Source changed since this capture")}</Badge>
              )}
              {run.error && <Notice error>{run.error}</Notice>}
              {run.cleanupError && <Notice error>{run.cleanupError}</Notice>}
            </>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            {!data && !error && <Loading>{t("Loading captures…")}</Loading>}
            {worktreeId && data && !data.settings && (
              <EmptyState>
                {t("Configure Playwright in Project settings to capture application flows.")}
              </EmptyState>
            )}
            {data?.settings && catalog && !run && (
              <EmptyState>
                {t(
                  files.length
                    ? "No captures yet. Run Playwright to record the actual application."
                    : "No recorded captures or tests match this worktree's changes.",
                )}
              </EmptyState>
            )}
            {run && (
              <>
                {cases.map((scenario) => (
                  <div key={scenario.id} className="flex flex-col gap-2">
                    {scenario.errors.map((message, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Recorded errors are immutable.
                      <Notice key={index} error>
                        {message}
                      </Notice>
                    ))}
                    {scenario.artifacts
                      .filter((artifact) => artifact.contentType === "image/png")
                      .map((image) => (
                        <CaptureImage key={image.id} api={api} run={run} image={image} />
                      ))}
                  </div>
                ))}
                {!cases.some((scenario) =>
                  scenario.artifacts.some((artifact) => artifact.contentType === "image/png"),
                ) && (
                  <EmptyState>
                    {t(
                      run.state === "finished"
                        ? "No completed screenshots in this execution."
                        : "Capturing application flows…",
                    )}
                  </EmptyState>
                )}
              </>
            )}
          </div>
        </div>
      </TestFileBrowser>
    </section>
  )
}
function CaptureImage({ api, run, image }: { api: Api; run: CaptureRun; image: CaptureArtifact }) {
  const { t } = useTranslation()
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {image.name}
        {image.viewport ? (
          <span>
            {" "}
            · {image.viewport.width} × {image.viewport.height}
          </span>
        ) : (
          <span> · {t("Viewport unavailable")}</span>
        )}
      </figcaption>
      <div className="overflow-auto bg-muted/30">
        <img
          src={api.captureArtifact(run.id, "after", image.id)}
          alt={image.name}
          style={{ maxWidth: "100%", height: "auto", objectFit: "contain", display: "block" }}
        />
      </div>
    </figure>
  )
}
