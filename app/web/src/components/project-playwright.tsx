import { type ReactNode, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, CaptureArtifact, CaptureCase, CaptureRun, PlaywrightFile } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { ChoiceList } from "./choice-list"
import { EmptyState, Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { ProjectPlaywrightAction } from "./project-playwright-action"
import { ReviewToolbarOverride } from "./review-toolbar"
import { TestFileBrowser } from "./test-file-browser"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"
import { UnifiedDiff } from "./unified-diff"

type ImageRecord = { run: CaptureRun; scenario: CaptureCase; image: CaptureArtifact }
type Page = "screenshots" | "tests" | "runs"
function imageGroups(runs: CaptureRun[]) {
  const groups = new Map<string, { name: string; records: ImageRecord[] }>()
  for (const run of runs) {
    if (run.purpose !== "capture") {
      continue
    }
    for (const scenario of run.after.cases) {
      for (const image of scenario.artifacts) {
        if (image.contentType !== "image/png" || image.name === "screenshot") {
          continue
        }
        const key = JSON.stringify([
          run.scope ?? "project",
          run.target,
          scenario.file,
          scenario.id,
          image.name,
        ])
        const group = groups.get(key) ?? { name: image.name, records: [] }
        group.records.push({ run, scenario, image })
        groups.set(key, group)
      }
    }
  }
  return [...groups].map(([id, value]) => ({ id, ...value }))
}

function latestCaptureRuns(runs: CaptureRun[]) {
  const latest = new Map<string, CaptureRun>()
  for (const run of [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (run.purpose !== "capture" || run.state !== "finished") {
      continue
    }
    const key = `${run.scope ?? "project"}:${run.target}`
    const previous = latest.get(key)
    if (!previous || (previous.outcome !== "passed" && run.outcome === "passed")) {
      latest.set(key, run)
    }
  }
  return [...latest.values()]
}

type ProjectPlaywrightProps = {
  api: Api
  projectId: string
}
export function ProjectPlaywright(props: ProjectPlaywrightProps) {
  return <ProjectPlaywrightReview key={props.projectId} {...props} />
}
function ProjectPlaywrightReview({ api, projectId }: ProjectPlaywrightProps) {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<CaptureRun[] | null>(null)
  const [catalog, setCatalog] = useState<Awaited<
    ReturnType<Api["projectPlaywrightCatalog"]>
  > | null>(null)
  const [error, setError] = useState("")
  const [catalogError, setCatalogError] = useState("")
  const [page, setPage] = useState<Page>("screenshots")
  const [selectedRun, setSelectedRun] = useState("")
  const [selectedFile, setSelectedFile] = useState("")
  const [selectedCaptureFile, setSelectedCaptureFile] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const [history, files] = await Promise.allSettled([
        api.projectPlaywright(projectId, signal),
        api.projectPlaywrightCatalog(projectId, signal),
      ])
      if (signal.aborted) {
        return
      }
      if (history.status === "fulfilled") {
        setRuns(history.value.runs)
        setError("")
      } else {
        setError(String(history.reason))
      }
      if (files.status === "fulfilled") {
        setCatalog(files.value)
        setCatalogError("")
      } else {
        setCatalogError(String(files.reason))
      }
    },
    [api, projectId],
  )
  useRefreshRequest(refresh, useLiveRevision())
  const files =
    catalog?.files.filter((file) => file.purpose === "functional" && file.scope !== "worktree") ??
    []
  const captureFiles =
    catalog?.files.filter((file) => file.purpose === "capture" && file.scope !== "worktree") ?? []
  const file = files.find((item) => item.path === selectedFile) ?? files[0]
  const run = runs?.find((item) => item.id === selectedRun) ?? runs?.[0]
  function openRun(id: string) {
    setSelectedRun(id)
    setPage("runs")
  }
  const hasContent = Boolean(runs?.length || catalog?.files.length)
  const action = (
    <ProjectPlaywrightAction
      api={api}
      projectId={projectId}
      onRun={(next) => {
        setRuns((current) => [next, ...(current ?? []).filter((item) => item.id !== next.id)])
        openRun(next.id)
      }}
    />
  )
  return (
    <section aria-label={t("Playwright")} className="flex min-h-0 flex-1 flex-col">
      {error && <Notice error>{error}</Notice>}
      <Tabs
        value={page}
        onValueChange={(value) => setPage(value as Page)}
        className="min-h-0 flex-1 gap-0"
      >
        <ReviewToolbarOverride
          secondary={
            <TabsList variant="view" aria-label={t("Playwright")} activateOnFocus>
              <TabsTrigger value="screenshots">{t("Screenshots")}</TabsTrigger>
              <TabsTrigger value="tests">{t("Tests")}</TabsTrigger>
              <TabsTrigger value="runs">{t("Runs")}</TabsTrigger>
            </TabsList>
          }
          actions={action}
        />
        {!hasContent && catalogError && <Notice error>{catalogError}</Notice>}
        <TabsContent
          value="screenshots"
          className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
        >
          {!runs && <Loading>{t("Loading captures…")}</Loading>}
          {runs && (
            <CaptureView
              api={api}
              projectId={projectId}
              files={captureFiles}
              path={selectedCaptureFile}
              runs={latestCaptureRuns(runs)}
              onSelect={setSelectedCaptureFile}
              onRun={openRun}
            />
          )}
        </TabsContent>
        <TabsContent value="tests" className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
          {catalogError && <Notice error>{catalogError}</Notice>}
          {!catalog && !catalogError && <Loading>{t("Loading recorded source…")}</Loading>}
          {catalog && (
            <TestsView
              api={api}
              projectId={projectId}
              files={files}
              file={file}
              runs={runs ?? []}
              onSelect={setSelectedFile}
              onRun={openRun}
            />
          )}
        </TabsContent>
        <TabsContent
          value="runs"
          className="flex h-0 min-h-0 flex-1 flex-col gap-3 overflow-hidden"
        >
          {!runs && <Loading>{t("Loading captures…")}</Loading>}
          {runs?.length === 0 && <EmptyState>{t("No Playwright executions yet.")}</EmptyState>}
          {run && (
            <>
              <ChoiceList
                compact
                label={t("Capture run")}
                value={run.id}
                onValueChange={setSelectedRun}
                options={(runs ?? []).map((item) => ({
                  value: item.id,
                  label: `${runLabel(item)} · ${item.outcome ?? item.state}`,
                }))}
              />
              <RecordedRunBrowser key={run.id} api={api} run={run} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}

function CaptureView({
  api,
  projectId,
  files: catalogFiles,
  path: selectedPath,
  runs,
  onSelect,
  onRun,
}: {
  api: Api
  projectId: string
  files: PlaywrightFile[]
  path: string
  runs: CaptureRun[]
  onSelect(path: string): void
  onRun(id: string): void
}) {
  const { t } = useTranslation()
  const [view, setView] = useState("screenshots")
  const [selected, setSelected] = useState("")
  const groups = imageGroups(runs)
  const files = [
    ...new Set([
      ...catalogFiles.map((file) => file.path),
      ...groups.map((group) => group.records[0].scenario.file),
    ]),
  ].map((path) => ({ path }))
  const file = files.find((file) => file.path === selectedPath) ?? files[0]
  const images = groups.filter((group) => group.records[0].scenario.file === file?.path)
  const group = images.find((group) => group.id === selected) ?? images[0]
  const record = group?.records[0]
  const source = catalogFiles.find((item) => item.path === file?.path)
  let sourceContent: ReactNode
  if (source) {
    sourceContent = (
      <PlaywrightSource key={source.path} api={api} projectId={projectId} path={source.path} />
    )
  } else if (record) {
    sourceContent = (
      <PlaywrightSource
        key={`${record.run.id}:${record.scenario.file}`}
        api={api}
        runId={record.run.id}
        path={record.scenario.file}
      />
    )
  } else {
    sourceContent = (
      <EmptyState>{t("No screenshots yet. Run a capture target from a worktree.")}</EmptyState>
    )
  }
  return (
    <TestFileBrowser
      mode="project"
      files={files}
      path={file?.path ?? ""}
      label={t("Captures")}
      onSelect={(path) => {
        onSelect(path)
        setSelected("")
        setView("screenshots")
      }}
    >
      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="min-h-0 flex-1"
      >
        <TabsList variant="underline" aria-label={t("Captures")}>
          <TabsTrigger value="source">{t("Test Code")}</TabsTrigger>
          <TabsTrigger value="screenshots">{t("Screenshots")}</TabsTrigger>
        </TabsList>
        <TabsContent value="source" className="flex h-0 min-h-0 flex-col overflow-auto">
          {sourceContent}
        </TabsContent>
        <TabsContent value="screenshots" className="flex h-0 min-h-0 flex-col gap-3 overflow-auto">
          {record ? (
            <>
              <ChoiceList
                compact
                label={t("Checkpoint")}
                value={group.id}
                onValueChange={setSelected}
                options={images.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.records[0].run.target} · ${item.records[0].scenario.title}`,
                }))}
              />
              <h2 className="text-base font-medium [overflow-wrap:anywhere]">
                {record.image.name}
              </h2>
              <img
                src={api.captureArtifact(record.run.id, "after", record.image.id)}
                alt={record.image.name}
                className="block min-h-0 max-w-full flex-1 object-contain"
              />
              <p className="content-width-768 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {t("Captured")}: {record.run.createdAt} · {record.run.projectRoot}
              </p>
              <TextLink onClick={() => onRun(record.run.id)}>{runLabel(record.run)}</TextLink>
            </>
          ) : (
            <EmptyState>
              {t("No screenshots yet. Run a capture target from a worktree.")}
            </EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </TestFileBrowser>
  )
}

function RecordedRunBrowser({ api, run }: { api: Api; run: CaptureRun }) {
  const { t } = useTranslation()
  const [path, setPath] = useState("")
  const [view, setView] = useState("results")
  const files = [...new Set(run.after.cases.map((scenario) => scenario.file))].map((path) => ({
    path,
  }))
  const file = files.find((file) => file.path === path) ?? files[0]
  const cases = run.after.cases.filter((scenario) => scenario.file === file?.path)
  return (
    <TestFileBrowser
      mode="project"
      files={files}
      path={file?.path ?? ""}
      onSelect={setPath}
      label={t("Playwright files")}
    >
      <p className="content-width-768 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {run.purpose} · {run.outcome ?? run.state} · {run.projectRoot} ·{" "}
        {run.settings.viewport.width} × {run.settings.viewport.height}
      </p>
      {run.error && <Notice error>{run.error}</Notice>}
      {run.cleanupError && <Notice error>{run.cleanupError}</Notice>}
      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="min-h-0 flex-1"
      >
        <TabsList variant="underline">
          <TabsTrigger value="results">{t("Execution results")}</TabsTrigger>
          <TabsTrigger value="source">{t("Test Code")}</TabsTrigger>
        </TabsList>
        <TabsContent value="results" className="flex h-0 min-h-0 flex-col gap-3 overflow-auto">
          {cases.length ? (
            cases.map((scenario) => (
              <StoredCase
                key={scenario.id}
                api={api}
                run={run}
                scenario={scenario}
                onSource={() => setView("source")}
              />
            ))
          ) : (
            <EmptyState>{t("No recorded test cases in this execution.")}</EmptyState>
          )}
        </TabsContent>
        <TabsContent value="source" className="flex h-0 min-h-0 flex-col overflow-auto">
          {file ? (
            <PlaywrightSource
              key={`${run.id}:${file.path}`}
              api={api}
              runId={run.id}
              path={file.path}
            />
          ) : (
            <EmptyState>{t("No recorded test cases in this execution.")}</EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </TestFileBrowser>
  )
}
function runLabel(run: CaptureRun) {
  return `${run.target} · ${run.createdAt}`
}
function TextLink({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <Button
      variant="link"
      className="h-auto min-w-0 max-w-full justify-start whitespace-normal p-0 text-left [overflow-wrap:anywhere]"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
function ListRow({ name, detail, onClick }: { name: string; detail: string; onClick(): void }) {
  return (
    <Button
      variant="ghost"
      aria-label={name}
      className="h-auto min-h-11 w-full content-width-768 flex-col items-start justify-start gap-1 whitespace-normal rounded-none border-b px-1 py-3 text-left"
      onClick={onClick}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      <span className="content-width-768 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {detail} →
      </span>
    </Button>
  )
}
function TestsView({
  api,
  projectId,
  files,
  file,
  runs,
  onSelect,
  onRun,
}: {
  api: Api
  projectId: string
  files: PlaywrightFile[]
  file?: PlaywrightFile
  runs: CaptureRun[]
  onSelect(path: string): void
  onRun(id: string): void
}) {
  const { t } = useTranslation()
  const [view, setView] = useState("code")
  const latest =
    file &&
    runs.find(
      (run) =>
        run.purpose === "functional" &&
        run.target === file.target &&
        run.after.cases.some((c) => c.file === file.path),
    )
  if (!file) {
    return (
      <EmptyState>
        {t("No functional Playwright files. Declare a functional target in Project settings.")}
      </EmptyState>
    )
  }
  return (
    <TestFileBrowser
      mode="project"
      files={files}
      path={file?.path ?? ""}
      label={t("Tests")}
      onSelect={(path) => {
        onSelect(path)
        setView("code")
      }}
    >
      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="min-h-0 flex-1"
      >
        <TabsList variant="underline" className="shrink-0">
          <TabsTrigger value="code">{t("Code")}</TabsTrigger>
          <TabsTrigger value="results">{t("Execution results")}</TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="flex h-0 min-h-0 min-w-0 flex-col gap-3 overflow-auto">
          <PlaywrightSource key={file.path} api={api} projectId={projectId} path={file.path} />
        </TabsContent>
        <TabsContent
          value="results"
          className="flex h-0 min-h-0 min-w-0 flex-col gap-3 overflow-auto"
        >
          {latest ? (
            <>
              <h3 className="text-sm font-medium">{t("Latest execution")}</h3>
              <ListRow
                name={runLabel(latest)}
                detail={latest.outcome ?? latest.state}
                onClick={() => onRun(latest.id)}
              />
            </>
          ) : (
            <EmptyState>{t("No recorded execution for this file.")}</EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </TestFileBrowser>
  )
}

function StoredCase({
  api,
  run,
  scenario,
  onSource,
}: {
  api: Api
  run: CaptureRun
  scenario: CaptureCase
  onSource(): void
}) {
  return (
    <section className="min-w-0 border-b py-3 [overflow-wrap:anywhere]">
      <h4 className="content-width-768 text-sm">
        {scenario.title} · {scenario.status}
      </h4>
      {scenario.errors.map((error) => (
        <Notice key={error} error>
          {error}
        </Notice>
      ))}
      <TextLink onClick={onSource}>{scenario.file}</TextLink>
      <ol className="content-width-768 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {scenario.steps.map((step, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Recorded step order is immutable.
          <li key={`${index}:${step.title}`}>
            {step.title} · {step.error ?? `${step.duration} ms`}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        {scenario.artifacts.map((artifact) =>
          artifact.contentType === "image/png" ? (
            <img
              key={artifact.id}
              src={api.captureArtifact(run.id, "after", artifact.id)}
              alt={artifact.name}
              className="block max-h-[60vh] max-w-full object-contain"
            />
          ) : (
            <a
              key={artifact.id}
              className="text-sm underline"
              href={api.captureArtifact(run.id, "after", artifact.id)}
              target="_blank"
              rel="noreferrer"
            >
              {artifact.name} · {artifact.contentType}
            </a>
          ),
        )}
      </div>
    </section>
  )
}
export function PlaywrightSource({
  api,
  projectId,
  runId,
  path,
}: {
  api: Api
  projectId?: string
  runId?: string
  path: string
}) {
  const { t } = useTranslation()
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      setSource(null)
      setError("")
      try {
        const value = runId
          ? await api.captureSource(runId, path, signal)
          : await api.projectPlaywrightSource(projectId!, path, signal)
        if (!signal.aborted) {
          setSource(value)
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, projectId, runId, path],
  )
  useRefreshRequest(refresh, useLiveRevision())
  if (error) {
    return <Notice error>{error}</Notice>
  }
  if (source === null) {
    return <Loading>{t("Loading recorded source…")}</Loading>
  }
  return <UnifiedDiff source={{ path, content: source }} />
}
