// biome-ignore-all lint/suspicious/noArrayIndexKey: Recorded diagnostics are immutable arrays and may contain repeated text.
import { Fragment, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  Api,
  CaptureRun,
  ExecutionSummary,
  ReviewContext,
  TestRun,
  TestSubmission,
  UnitRun,
} from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { navigateReviewLink } from "@/lib/workspace-history"
import { ExecutionProgress } from "./execution-progress"
import { Loading, Notice } from "./feedback"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { TestEvidence } from "./test-observation"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { UnifiedDiff } from "./unified-diff"
import { ViewerImage, ViewerLink } from "./viewer-asset"

const executionLabels = {
  unit: "Unit",
  integration: "Integration",
  playwright: "Playwright",
} as const

function EvidenceBoundary() {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t("Evidence boundaries")}
      className="flex flex-col gap-1 text-sm text-muted-foreground"
    >
      <p>
        {t(
          "A passing result describes the recorded execution. Current code freshness is not established.",
        )}
      </p>
      <p>{t("Human acceptance is not recorded.")}</p>
    </section>
  )
}
export function ExecutionReview({
  api,
  execution,
}: {
  api: Api
  execution: { kind: ExecutionSummary["kind"]; id: string }
}) {
  const { t } = useTranslation()
  const [context, setContext] = useState<ReviewContext>()
  const [error, setError] = useState("")
  const [actionRevision, setActionRevision] = useState(0)
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const result = await api.reviewContext(execution.kind, execution.id, signal)
        if (!signal.aborted) {
          setContext(result)
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, execution.kind, execution.id],
  )
  return (
    <LiveUpdates
      worktreeId={context?.worktreeId ?? undefined}
      scope="evidence"
      enabled={Boolean(context?.worktreeId)}
    >
      <ExecutionReviewRefresh refresh={refresh} actionRevision={actionRevision} />
      <section className="mx-auto flex w-full min-w-0 content-width-768 flex-col gap-5">
        {context?.worktreeId && (
          <a
            onClick={navigateReviewLink}
            className="text-sm underline underline-offset-4"
            href={`?page=history&worktree=${encodeURIComponent(context.worktreeId)}`}
          >
            {t("Execution history")}
          </a>
        )}
        <header>
          <p className="text-sm text-muted-foreground">{t("Execution review")}</p>
          <h1 className="mt-1 break-words text-2xl font-semibold">
            {context?.intent || execution.id}
          </h1>
        </header>
        {error && (
          <Notice error>{t("{{error}} · Displayed evidence may be outdated.", { error })}</Notice>
        )}
        {!context && !error && <Loading>{t("Loading execution…")}</Loading>}
        {context && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t(executionLabels[context.kind])}</Badge>
              <Badge variant="outline">{t(context.outcome ?? context.state)}</Badge>
              <Badge variant="outline">
                {t("Cleanup")}: {t(context.cleanup.state)}
              </Badge>
            </div>
            <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt>{t("Execution")}</dt>
              <dd className="break-all">{context.executionId ?? context.id}</dd>
              <dt>{t("Checkout")}</dt>
              <dd className="break-all">{context.path ?? t("Original folder unavailable")}</dd>
            </dl>
            <EvidenceBoundary />
            {context.failures.map((failure, index) => (
              <Notice error key={index}>
                {failure.file && <p className="break-all">{failure.file}</p>}
                {failure.case && <p>{failure.case}</p>}
                <pre className="whitespace-pre-wrap break-words text-code">{failure.message}</pre>
              </Notice>
            ))}
            {context.failureCount > context.failures.length && (
              <Notice>
                {t("Showing {{shown}} of {{total}} failures. Open recorded evidence for details.", {
                  shown: context.failures.length,
                  total: context.failureCount,
                })}
              </Notice>
            )}
            {context.cleanup.issues.map((issue, index) => (
              <Notice error key={index}>
                {issue}
              </Notice>
            ))}
            <ExecutionReviewActions
              api={api}
              context={context}
              stale={Boolean(error)}
              onChange={() => setActionRevision((value) => value + 1)}
            />
            {context.executionId && <RecordedEvidence api={api} context={context} />}
          </>
        )}
      </section>
    </LiveUpdates>
  )
}
function ExecutionReviewRefresh({
  refresh,
  actionRevision,
}: {
  refresh: (signal: AbortSignal) => Promise<void>
  actionRevision: number
}) {
  useRefreshRequest(refresh, useLiveRevision(), actionRevision)
  return null
}

function RecordedEvidence({ api, context }: { api: Api; context: ReviewContext }) {
  const { t } = useTranslation()
  const [logs, setLogs] = useState({ stdout: "", stderr: "" })
  const [unit, setUnit] = useState<UnitRun>()
  const [submission, setSubmission] = useState<TestSubmission>()
  const [run, setRun] = useState<TestRun>()
  const [capture, setCapture] = useState<CaptureRun>()
  const [error, setError] = useState("")
  const revision = useLiveRevision()
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const id = context.executionId
      if (!id) {
        return
      }
      try {
        if (context.kind === "integration") {
          const [result, output] = await Promise.all([api.run(id, signal), api.runLogs(id, signal)])
          if (!signal.aborted) {
            setLogs({ stdout: output.stdout?.text ?? "", stderr: output.stderr?.text ?? "" })
          }
          if (result.submissionId) {
            const value = await api.submission(result.submissionId, signal)
            if (!signal.aborted) {
              setSubmission(value)
            }
          }
          if (!signal.aborted) {
            setRun(result)
          }
        }
        if (context.kind === "playwright") {
          const result = await api.captureRun(id, signal)
          if (!signal.aborted) {
            setCapture(result)
          }
        }
        if (context.kind === "unit") {
          const result = await api.unitRun(id, signal)
          if (!signal.aborted) {
            setUnit(result)
            setLogs({ stdout: result.stdout, stderr: result.stderr })
          }
        }
        if (!signal.aborted) {
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, context.kind, context.executionId],
  )
  useRefreshRequest(refresh, revision)
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-base font-semibold">{t("Recorded evidence")}</h2>
      {error && <Notice error>{error}</Notice>}
      {submission && <TestEvidence submission={submission} run={run ?? null} />}
      {unit && <ExecutionProgress kind="unit" run={unit} />}
      {unit && (
        <p className="text-sm">{t("Exit code: {{code}}", { code: unit.exitCode ?? "—" })}</p>
      )}
      {(["stdout", "stderr"] as const).map((stream) =>
        logs[stream] ? (
          <section key={stream} aria-label={stream} className="min-w-0">
            <h3 className="text-sm font-medium">{stream}</h3>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-code">
              {logs[stream]}
            </pre>
          </section>
        ) : null,
      )}
      {unit && !logs.stdout && !logs.stderr && <p>{t("No output recorded.")}</p>}
      {capture && <ExecutionProgress kind="playwright" run={capture} />}
      {capture &&
        (["after", "before"] as const)
          .filter((side) => capture[side].cases.length > 0)
          .map((side) => (
            <section key={side} className="flex min-w-0 flex-col gap-3">
              <h3 className="text-sm font-medium">{t(side === "after" ? "After" : "Before")}</h3>
              {capture[side as "after" | "before"].cases.map((item) => (
                <div key={item.id} className="flex min-w-0 flex-col gap-2">
                  <h3 className="break-words text-sm font-medium">
                    {item.title} · {t(item.status)}
                  </h3>
                  {item.errors.map((error, index) => (
                    <Notice key={index} error>
                      {error}
                    </Notice>
                  ))}
                  {item.steps.map((step, index) => (
                    <p key={index} className="break-words text-sm">
                      {step.title}
                      {step.error ? ` · ${step.error}` : ""}
                    </p>
                  ))}
                  <Collapsible>
                    <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
                      {t("Executed source")}: {item.file}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <PlaywrightSource api={api} runId={capture.id} path={item.file} />
                    </CollapsibleContent>
                  </Collapsible>
                  {item.artifacts.map((artifact) =>
                    artifact.contentType.startsWith("image/") ? (
                      <ViewerImage
                        key={artifact.id}
                        src={api.captureArtifact(
                          capture.id,
                          side as "after" | "before",
                          artifact.id,
                        )}
                        alt={artifact.name}
                        className="h-auto max-w-full rounded-md border"
                      />
                    ) : (
                      <ViewerLink
                        key={artifact.id}
                        href={api.captureArtifact(
                          capture.id,
                          side as "after" | "before",
                          artifact.id,
                        )}
                        className="break-all underline"
                      >
                        {artifact.name}
                      </ViewerLink>
                    ),
                  )}
                </div>
              ))}
            </section>
          ))}
    </section>
  )
}

function ExecutionReviewActions({
  api,
  context,
  onChange,
  stale = false,
}: {
  api: Api
  context: ReviewContext
  stale?: boolean
  onChange: () => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const approval = context.approval
  const awaiting =
    approval?.state === "pending" ||
    approval?.state === "awaiting_approval" ||
    approval?.state === "awaiting_environment_approval" ||
    approval?.state === "awaiting_test_approval"
  if (!awaiting) {
    return null
  }
  async function act() {
    if (pending) {
      return
    }
    setPending(true)
    setError("")
    try {
      if (approval) {
        let subject: "environment" | "tests" | undefined
        if (context.kind === "integration") {
          subject = approval.environmentApproved ? "tests" : "environment"
        }
        await api.approveExecutionReview(context.kind, context.id, approval.revision, subject)
      }
      onChange()
    } catch (cause) {
      setError(String(cause))
      onChange()
    } finally {
      setPending(false)
    }
  }
  let approvalLabel = t("Approve execution")
  if (context.kind === "integration") {
    approvalLabel = t(approval?.environmentApproved ? "Approve tests" : "Approve environment")
  }
  return (
    <section className="flex flex-col gap-3">
      {awaiting && approval?.preview && <ApprovalPreviewContent preview={approval.preview} />}
      {awaiting && !approval?.preview && (
        <Notice error>{t("Request details are unavailable. Refresh before approving.")}</Notice>
      )}
      {awaiting && (
        <p className="text-sm text-muted-foreground">
          {t("Execution approval allows running code. It does not accept code changes.")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {awaiting && (
          <Button disabled={pending || stale || !approval?.preview} onClick={() => void act()}>
            {approvalLabel}
          </Button>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
    </section>
  )
}

function ApprovalPreviewContent({
  preview,
}: {
  preview: NonNullable<NonNullable<ReviewContext["approval"]>["preview"]>
}) {
  const { t } = useTranslation()
  const fields: [string, string | undefined][] = [
    [t("Command"), preview.command],
    [t("Working directory"), preview.cwd],
    [t("Dockerfile"), preview.dockerfile],
    [t("Target"), preview.target],
    [t("Purpose"), preview.purpose],
    [
      t("Viewport"),
      preview.viewport ? `${preview.viewport.width} × ${preview.viewport.height}` : undefined,
    ],
    [t("Settings digest"), preview.settingsDigest],
    [t("Input digest"), preview.inputDigest],
    [t("Source digest"), preview.sourceDigest],
  ]
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t("Requested execution")}>
      <h2 className="text-base font-semibold">{t("Requested execution")}</h2>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {fields
          .filter(([, value]) => value !== undefined)
          .map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap break-all">{value}</dd>
            </Fragment>
          ))}
      </dl>
      {preview.services && (
        <div>
          <h3 className="text-sm font-medium">
            {t("Services")} · {preview.serviceCount}
          </h3>
          <ul>
            {preview.services.map((service) => (
              <li className="break-all" key={service}>
                {service}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.dependencies && (
        <div>
          <h3 className="text-sm font-medium">
            {t("Dependencies")} · {preview.dependencyCount}
          </h3>
          <ul>
            {preview.dependencies.map((dependency) => (
              <li key={dependency.name}>
                {dependency.name} · {dependency.kind}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.tests && (
        <div>
          <h3 className="text-sm font-medium">
            {t("Submitted test files")} · {preview.testFileCount}
          </h3>
          <ul className="flex flex-col gap-2">
            {preview.tests.map((file) => (
              <li key={file.path}>
                <p className="break-all">
                  {file.path} · {file.scenarioCount}
                </p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {file.scenarios.map((scenario, index) => (
                    <li key={index}>{scenario}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function PlaywrightSource({ api, runId, path }: { api: Api; runId: string; path: string }) {
  const { t } = useTranslation()
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      setSource(null)
      setError("")
      try {
        const value = await api.captureSource(runId, path, signal)
        if (!signal.aborted) {
          setSource(value)
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, runId, path],
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
