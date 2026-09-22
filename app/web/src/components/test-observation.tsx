// biome-ignore-all lint/suspicious/noArrayIndexKey: Immutable evidence arrays have no unique IDs and can contain duplicate names and assertions.
import { Check, Minus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { EmptyState, Loading, Notice } from "./feedback"
import { ListGroup, ListHeader, ListItem, ListItems } from "./kibo-ui/list"
import { useLiveRevision } from "./live-updates"
import { TestCode } from "./test-code"
import { TestFileBrowser } from "./test-file-browser"
import { Badge } from "./ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"
import { Item, ItemContent, ItemTitle } from "./ui/item"
import { UnifiedDiff } from "./unified-diff"
import "@/locales"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/components/reui/timeline"
import { Button } from "@/components/ui/button"
import type { Api, TestRun, TestSubmission } from "@/lib/api"

export function TestObservation({
  api,
  worktreeId,
  scope = "changed",
  actionsContainer,
}: {
  api: Api
  worktreeId: string
  projectId?: string
  scope?: "changed" | "all"
  actionsContainer?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const revision = useLiveRevision()
  const [data, setData] = useState<Awaited<ReturnType<Api["integrationTests"]>>>()
  const [evidence, setEvidence] = useState<{
    submission: TestSubmission
    run: TestRun | null
  } | null>(null)
  const [error, setError] = useState("")
  const [evidenceError, setEvidenceError] = useState("")
  const [evidenceWorktree, setEvidenceWorktree] = useState("")
  useEffect(() => {
    void revision
    const abort = new AbortController()
    void api
      .integrationTests(worktreeId, abort.signal, scope)
      .then((value) => {
        if (!abort.signal.aborted) {
          setData(value)
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(String(error))
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, revision, scope])
  useEffect(() => {
    void revision
    const abort = new AbortController()
    async function refresh() {
      const page = await api.submissions(worktreeId, "", abort.signal)
      const id = page.items[0]?.id
      if (!id) {
        return null
      }
      const [submission, runs] = await Promise.all([
        api.submission(id, abort.signal),
        api.runs(id, "", abort.signal),
      ])
      const run = runs.items[0] ? await api.run(runs.items[0].id, abort.signal) : null
      return { submission, run }
    }
    void refresh()
      .then((value) => {
        if (!abort.signal.aborted) {
          setEvidence(value)
          setEvidenceWorktree(worktreeId)
          setEvidenceError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setEvidenceError(String(error))
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, revision])
  return (
    <section
      aria-label={t("Integration Test")}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      <IntegrationRunControls
        key={worktreeId}
        api={api}
        actionsContainer={actionsContainer}
        runCurrent={scope === "all" ? () => api.runIntegrationTests(worktreeId) : undefined}
        submissionId={evidence?.submission.id}
        run={evidence?.run ?? null}
        unavailable={!data || Boolean(error || evidenceError) || evidenceWorktree !== worktreeId}
        onStarted={async (run) => {
          if (scope === "all" && "submissionId" in run && typeof run.submissionId === "string") {
            const submission = await api.submission(run.submissionId)
            setEvidence({ submission, run })
          } else {
            setEvidence((current) =>
              current && current.submission.id === evidence?.submission.id
                ? { ...current, run }
                : current,
            )
          }
        }}
      />
      {error && (
        <Notice error>{t("{{error}} · Displayed evidence may be outdated.", { error })}</Notice>
      )}
      {evidenceError && (
        <Notice error>
          {t("{{error}} · Displayed evidence may be outdated.", { error: evidenceError })}
        </Notice>
      )}
      {!data && !error && <Loading>{t("Loading tests…")}</Loading>}
      {data && (
        <IntegrationTestFiles
          api={api}
          worktreeId={worktreeId}
          data={data}
          scope={scope}
          submission={evidence?.submission ?? null}
          run={evidence?.run ?? null}
        />
      )}
    </section>
  )
}

function IntegrationRunControls({
  api,
  submissionId,
  run,
  unavailable,
  onStarted,
  actionsContainer,
  runCurrent,
}: {
  runCurrent?: () => Promise<TestRun>
  api: Api
  submissionId?: string
  run: TestRun | null
  unavailable: boolean
  actionsContainer?: HTMLElement | null
  onStarted: (run: TestRun) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [accepted, setAccepted] = useState<TestRun | null>(null)
  useEffect(() => {
    if (accepted && run?.id === accepted.id) {
      setAccepted(null)
    }
  }, [accepted, run])
  const currentRun = run?.id === accepted?.id ? run : (accepted ?? run)
  const active = Boolean(currentRun && currentRun.state !== "finished")
  async function execute() {
    if ((!submissionId && !runCurrent) || pending || active || unavailable) {
      return
    }
    setPending(true)
    setError("")
    try {
      let next: TestRun
      if (runCurrent) {
        next = await runCurrent()
      } else if (submissionId) {
        next = await api.startRun(submissionId)
      } else {
        return
      }
      setAccepted(next)
      await onStarted(next)
    } catch (error) {
      setError(String(error))
    } finally {
      setPending(false)
    }
  }
  const runButton = (
    <Button
      size="toolbar"
      variant="ghost"
      title={
        runCurrent
          ? t("Runs current integration sources with the fixed project configuration.")
          : t("Runs the latest submission in full, not the selected current file.")
      }
      disabled={(!submissionId && !runCurrent) || pending || active || unavailable}
      onClick={() => void execute()}
    >
      {t("Run Integration tests")}
    </Button>
  )
  const controls = (
    <div className="flex items-center gap-2">
      {runButton}
      {active && (
        <span role="status" className="text-xs text-muted-foreground">
          {t("Run status: {{status}}", { status: currentRun?.state })}
        </span>
      )}
    </div>
  )
  return (
    <>
      {actionsContainer ? createPortal(controls, actionsContainer) : controls}
      {!submissionId && !runCurrent && !unavailable && (
        <Notice>{t("Submit tests before running them.")}</Notice>
      )}
      {error && <Notice error>{error}</Notice>}
    </>
  )
}

export function IntegrationTestFiles({
  api,
  worktreeId,
  data,
  submission,
  run,
  scope = "changed",
}: {
  api: Api
  worktreeId: string
  scope?: "changed" | "all"
  data: Awaited<ReturnType<Api["integrationTests"]>>
  submission: TestSubmission | null
  run: TestRun | null
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState("")
  const [view, setView] = useState("code")
  const selected = data.catalog.files.find((file) => file.path === path) ?? data.catalog.files[0]
  const relativePath = selected?.path.slice(data.directory.length + 1)
  const captured = submission?.files.find((file) => file.path === relativePath)
  const selectedSubmission =
    submission && captured
      ? {
          ...submission,
          files: [captured],
          parsed: submission.parsed.filter((file) => file.path === relativePath),
        }
      : null
  const result = run?.result
    ? {
        ...run.result,
        cases: run.result.cases.filter((result) => result.file === relativePath),
      }
    : null
  const selectedRun = run ? { ...run, result } : null
  return (
    <TestFileBrowser
      mode={scope === "all" ? "project" : "worktree"}
      files={data.catalog.files}
      path={selected?.path ?? ""}
      label={scope === "all" ? t("Integration test files") : t("Changed integration test files")}
      onSelect={(path) => {
        setPath(path)
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
        <TabsContent value="code" className="flex h-0 min-h-0 flex-col gap-3 overflow-auto">
          {data.catalog.diagnostics.map((message) => (
            <Notice key={message}>{message}</Notice>
          ))}
          {!selected && (
            <EmptyState>
              {scope === "all"
                ? t("No integration test files.")
                : t("No changed integration test files.")}
            </EmptyState>
          )}
          {selected && selected.source !== null && (
            <TestCode
              api={api}
              worktreeId={worktreeId}
              scope={scope}
              baseRevision={data.catalog.baseRevision}
              source={{ path: selected.path, content: selected.source }}
            />
          )}
          {selected && selected.source === null && <Notice>{selected.issue}</Notice>}
        </TabsContent>
        <TabsContent value="results" className="flex h-0 min-h-0 flex-col gap-3 overflow-auto">
          {selectedSubmission ? (
            <TestEvidence
              key={`${submission?.id}:${relativePath}`}
              withFileList={false}
              submission={selectedSubmission}
              run={selectedRun}
            />
          ) : (
            <EmptyState>{t("No recorded result for this file.")}</EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </TestFileBrowser>
  )
}

export function TestEvidence({
  submission,
  run,
  withFileList = true,
}: {
  submission: TestSubmission
  run: TestRun | null
  withFileList?: boolean
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState("")
  const files = [
    ...new Set([
      ...(run?.result?.cases.map((item) => item.file) ?? []),
      ...submission.files.map((file) => file.path),
      ...submission.parsed.map((file) => file.path),
    ]),
  ].map((path) => ({ path }))
  const selected = files.find((file) => file.path === path)?.path ?? files[0]?.path ?? ""
  const file = submission.files.find((file) => file.path === selected)
  const scopedSubmission = {
    ...submission,
    parsed: submission.parsed.filter((file) => file.path === selected),
  }
  const scopedRun = run?.result
    ? {
        ...run,
        result: { ...run.result, cases: run.result.cases.filter((item) => item.file === selected) },
      }
    : run
  return (
    <div className="flex h-[32rem] min-h-0 flex-col">
      <TestFileBrowser
        files={withFileList ? files : []}
        path={selected}
        onSelect={setPath}
        label={t("Tests")}
      >
        <Tabs defaultValue="results" className="min-h-0 flex-1">
          <TabsList variant="underline">
            <TabsTrigger value="results">{t("Execution results")}</TabsTrigger>
            <TabsTrigger value="source">{t("Executed source")}</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="flex h-0 min-h-0 flex-col overflow-auto">
            <TestEvidenceResults submission={scopedSubmission} run={scopedRun} />
          </TabsContent>
          <TabsContent
            value="source"
            aria-label={t("Submitted test source")}
            className="flex h-0 min-h-0 flex-col gap-3 overflow-auto"
          >
            {file ? (
              <UnifiedDiff source={{ path: file.path, content: file.source }} />
            ) : (
              <EmptyState>{t("No recorded test cases in this execution.")}</EmptyState>
            )}
            <p className="break-all text-xs text-muted-foreground">
              {t("Submission {{id}} · Digest {{digest}}", {
                id: submission.id,
                digest: submission.digest,
              })}
            </p>
          </TabsContent>
        </Tabs>
      </TestFileBrowser>
    </div>
  )
}

function TestEvidenceResults({
  submission,
  run,
}: {
  submission: TestSubmission
  run: TestRun | null
}) {
  const { t } = useTranslation()
  const cases = run?.result?.cases ?? []
  const groups = new Map<string, { result: (typeof cases)[number]; index: number }[]>()
  for (const [index, result] of cases.entries()) {
    const group = groups.get(result.state) ?? []
    group.push({ result, index })
    groups.set(result.state, group)
  }
  const states = ["failed", ...Array.from(groups.keys()).filter((state) => state !== "failed")]
  function groupName(state: string) {
    if (state === "passed") {
      return t("Success")
    }
    if (state === "failed") {
      return t("Failed")
    }
    return t(state)
  }
  return (
    <section
      aria-label={t("Observed test results")}
      className="flex w-full min-w-0 content-width-768 flex-col gap-6 [overflow-wrap:anywhere]"
    >
      {(!run?.result || !cases.length || run.result.outcome !== "passed") && (
        <Badge variant="outline">{run ? t(run.result?.outcome ?? run.state) : t("Not run")}</Badge>
      )}
      {run?.result?.errors.map((error, index) => (
        <Notice error key={index}>
          {error}
        </Notice>
      ))}

      <div className="min-w-0">
        {states
          .filter((state) => groups.has(state))
          .map((state) => (
            <ListGroup key={state} name={groupName(state)}>
              <ListHeader
                name={groupName(state)}
                count={groups.get(state)?.length ?? 0}
                failed={state === "failed"}
              />
              <ListItems>
                {groups.get(state)?.map(({ result, index }) => {
                  return (
                    <ListItem key={`${index}-${result.file}-${result.name}`}>
                      <Item render={<article />} className="items-start" size="sm">
                        <ItemContent className="gap-4">
                          <ItemTitle>
                            <h3 className="min-w-0 [overflow-wrap:anywhere]">{result.name}</h3>
                          </ItemTitle>
                          {Boolean(result.steps?.length) && (
                            <ObservedSteps steps={result.steps ?? []} showDuration={false} />
                          )}
                          {result.errors.map((error, index) => (
                            <Notice error key={index}>
                              <pre className="whitespace-pre-wrap break-words text-code">
                                {`${error.name}: ${error.message}`}
                                {error.stack && `\n${error.stack}`}
                              </pre>
                            </Notice>
                          ))}
                        </ItemContent>
                      </Item>
                    </ListItem>
                  )
                })}
              </ListItems>
            </ListGroup>
          ))}
        {!cases.length &&
          submission.parsed.flatMap((file) =>
            file.review.scenarios.map((scenario, index) => (
              <Item key={`${file.path}-${index}`} size="sm">
                <ItemContent>
                  <ItemTitle>
                    <h3>{scenario.title}</h3>
                    <Badge variant="outline">
                      {run?.result?.outcome === "environment_error"
                        ? t("Environment failed; no test results were recorded")
                        : t("No recorded result")}
                    </Badge>
                  </ItemTitle>
                </ItemContent>
              </Item>
            )),
          )}
      </div>
      {!cases.length && (
        <p className="text-muted-foreground">{t("No individual test results were recorded.")}</p>
      )}
    </section>
  )
}

function ObservedSteps({
  steps,
  showDuration = true,
}: {
  steps: NonNullable<NonNullable<TestRun["result"]>["cases"][number]["steps"]>
  showDuration?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Timeline value={0} aria-label={t("Observed steps")}>
      {steps.map((step, index) => {
        function stepIcon() {
          if (step.state === "passed") {
            return Check
          }
          if (step.state === "failed") {
            return X
          }
          return Minus
        }
        const StepIcon = stepIcon()
        return (
          <TimelineItem step={index + 1} key={step.id} data-step-state={step.state}>
            <TimelineIndicator className="flex items-center justify-center group-data-[orientation=vertical]/timeline:top-0.5">
              <StepIcon className="size-3" aria-hidden="true" />
            </TimelineIndicator>
            <TimelineSeparator className="group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=vertical]/timeline:translate-y-5" />
            <TimelineContent className="flex min-w-0 flex-col gap-1 leading-5">
              <span className="min-w-0 [overflow-wrap:anywhere]">{step.name}</span>
              <span className="flex flex-wrap items-baseline gap-2 text-xs">
                <span
                  className={step.state === "failed" ? "text-destructive" : "text-muted-foreground"}
                >
                  {t(step.state)}
                </span>
                {showDuration && step.durationMs !== undefined && (
                  <span className="shrink-0 font-mono text-xs">
                    {t("{{duration}} ms", { duration: Math.round(step.durationMs) })}
                  </span>
                )}
              </span>
            </TimelineContent>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}
