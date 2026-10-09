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
  WorkspaceStatus,
  Worktree,
} from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { worktreeName } from "@/lib/worktree-name"
import { CopyHandoff } from "./copy-handoff"
import { ExecutionLog, ExecutionRow } from "./execution-log"
import { EmptyState, Loading, Notice } from "./feedback"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { PlaywrightSource } from "./project-playwright"
import { SearchPicker } from "./search-picker"
import { TestEvidence } from "./test-observation"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { ViewerImage, ViewerLink } from "./viewer-asset"

const executionLabels = {
  unit: "Unit",
  integration: "Integration",
  playwright: "Playwright",
} as const

type ReviewAction = (kind: ExecutionSummary["kind"], id: string) => void
type WorkspaceProps = { api: Api; worktree?: Worktree; loading: boolean; onReview: ReviewAction }

export function CheckoutSelector({
  worktrees,
  selectedId,
  onSelect,
}: {
  worktrees: Worktree[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="w-full max-w-sm">
      <SearchPicker
        label={t("Checkout")}
        value={selectedId}
        options={worktrees.map((worktree) => ({
          value: worktree.id,
          label: worktreeName(worktree),
        }))}
        onValueChange={onSelect}
        disabled={!worktrees.length}
        searchable
      />
    </div>
  )
}

export function CurrentWork(props: WorkspaceProps) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex w-full min-w-0 content-width-768 flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("Current work")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Ask in chat. Review the evidence here.")}
        </p>
      </header>
      {props.loading && <Loading>{t("Loading worktrees…")}</Loading>}
      {!props.loading && !props.worktree && <EmptyState>{t("No worktrees found.")}</EmptyState>}
      {props.worktree && (
        <LiveUpdates worktreeId={props.worktree.id} scope="evidence">
          <CurrentCheckout key={props.worktree.id} {...props} worktree={props.worktree} />
        </LiveUpdates>
      )}
    </section>
  )
}
function CurrentCheckout({ api, worktree, onReview }: WorkspaceProps & { worktree: Worktree }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<WorkspaceStatus>()
  const [error, setError] = useState("")
  const revision = useLiveRevision()
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const result = await api.workspaceStatus(worktree.projectRoot, signal)
        if (!signal.aborted) {
          setStatus(result)
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, worktree.projectRoot],
  )
  useRefreshRequest(refresh, revision)
  return (
    <>
      <EvidenceBoundary />
      {error && (
        <Notice error>{t("{{error}} · Displayed evidence may be outdated.", { error })}</Notice>
      )}
      {!status && !error && <Loading>{t("Loading current work…")}</Loading>}
      {status && (
        <>
          <section className="flex flex-wrap gap-2" aria-label={t("Execution prerequisites")}>
            <Badge variant="outline">
              {t(status.settings.valid ? "Settings valid" : "Settings need attention")}
            </Badge>
            <Badge variant="outline">{t("Readiness not checked")}</Badge>
            <Badge variant="outline">
              {t("Approval: {{policy}}", { policy: t(status.approval.policy) })}
            </Badge>
          </section>
          {status.settings.issues.map((issue, index) => (
            <Notice error key={index}>
              {issue.path}: {issue.message}
            </Notice>
          ))}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">
              {t("Awaiting approval")} · {status.approval.pendingCount}
            </h2>
            {status.approval.pending.length ? (
              <ul className="divide-y">
                {status.approval.pending.map((request) => (
                  <li
                    key={request.id}
                    className="flex min-w-0 items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p>
                        {t(executionLabels[request.kind])} · {t(request.state)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{request.id}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReview(request.kind, request.id)}
                    >
                      {t("Review request")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("No requests awaiting approval.")}</p>
            )}
          </section>
          <ExecutionGroup
            title={t("In progress")}
            api={api}
            rows={status.executions.active}
            onReview={onReview}
            empty={t("No executions in progress.")}
          />
          <ExecutionGroup
            title={t("Cleanup needs attention")}
            api={api}
            rows={status.executions.cleanup}
            onReview={onReview}
            empty={t("No cleanup issues.")}
          />
          <ExecutionGroup
            title={t("Recent evidence")}
            api={api}
            rows={status.executions.recent.slice(0, 5)}
            onReview={onReview}
            empty={t("No executions yet")}
          />
        </>
      )}
      <CopyHandoff
        showContext={false}
        context={{
          title: t("Continue in chat"),
          summary: t(
            "Inspect this checkout, implement with tests first, and submit verification through Redpact.",
          ),
          fields: [
            ["Checkout", worktree.projectRoot],
            ["Worktree", worktree.id],
          ],
        }}
      >
        <p className="text-sm text-muted-foreground">
          {t(
            "Ask your agent to diagnose settings, run tests, inspect failures, or retry cleanup. Copy the checkout context to keep the target explicit.",
          )}
        </p>
      </CopyHandoff>
    </>
  )
}
function ExecutionGroup({
  title,
  api,
  rows,
  onReview,
  empty,
}: {
  title: string
  api: Api
  rows: ExecutionSummary[]
  onReview: ReviewAction
  empty: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="min-w-0 divide-y">
          {rows.map((run) => (
            <ExecutionRow key={`${run.kind}:${run.id}`} api={api} run={run} onReview={onReview} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}
export function ExecutionHistory({ api, worktree, loading, onReview }: WorkspaceProps) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex w-full min-w-0 content-width-768 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("Execution history")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Recorded executions stay tied to their submitted checkout and source.")}
        </p>
      </header>
      {loading && <Loading>{t("Loading worktrees…")}</Loading>}
      {!loading && !worktree && <EmptyState>{t("No worktrees found.")}</EmptyState>}
      {worktree && (
        <LiveUpdates worktreeId={worktree.id} scope="evidence">
          <ExecutionLog key={worktree.id} api={api} worktreeId={worktree.id} onReview={onReview} />
        </LiveUpdates>
      )}
    </section>
  )
}
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
  onHistory,
}: {
  api: Api
  execution: { kind: ExecutionSummary["kind"]; id: string }
  onHistory: () => void
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
        <div>
          <Button variant="ghost" size="sm" onClick={onHistory}>
            {t("Execution history")}
          </Button>
        </div>
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
            <CopyHandoff
              showContext={false}
              context={{
                title: t("Continue in chat"),
                summary: t(
                  "Inspect this recorded execution and its evidence before changing code or requesting another run.",
                ),
                fields: [
                  ["Kind", context.kind],
                  ["Execution", context.id],
                  ["Checkout", context.path ?? ""],
                  ["Review", context.reviewPath],
                ],
              }}
            >
              <p className="text-sm text-muted-foreground">
                {t("Copy this execution context to ask your agent about failures or cleanup.")}
              </p>
            </CopyHandoff>
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
  const [logs, setLogs] = useState("")
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
          const result = await api.run(id, signal)
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
            setLogs([result.stdout, result.stderr].filter(Boolean).join("\n"))
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
      {context.kind === "unit" && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-code">
          {logs || t("No output recorded.")}
        </pre>
      )}
      {capture &&
        (["after", "before"] as const)
          .filter((side) => capture[side].cases.length > 0)
          .map((side) => (
            <section key={side} className="flex min-w-0 flex-col gap-3">
              <h3 className="text-sm font-medium">{t(side === "after" ? "After" : "Before")}</h3>
              {capture[side as "after" | "before"].cases.map((item) => (
                <div key={item.id} className="flex min-w-0 flex-col gap-2">
                  <p>
                    {item.title} · {t(item.status)}
                  </p>
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
  const active = !["finished", "cancelled", "rejected", "failed", "interrupted"].includes(
    context.state,
  )
  if (!awaiting && !active && context.cleanup.state !== "failed") {
    return null
  }
  async function act(approve: boolean) {
    if (pending) {
      return
    }
    setPending(true)
    setError("")
    try {
      if (approve && approval) {
        let subject: "environment" | "tests" | undefined
        if (context.kind === "integration") {
          subject = approval.environmentApproved ? "tests" : "environment"
        }
        await api.approveExecutionReview(context.kind, context.id, approval.revision, subject)
      } else {
        await api.cancelExecutionReview(context.kind, context.id)
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
          <Button disabled={pending || stale || !approval?.preview} onClick={() => void act(true)}>
            {approvalLabel}
          </Button>
        )}
        <Button variant="outline" disabled={pending} onClick={() => void act(false)}>
          {t(context.cleanup.state === "failed" ? "Retry container cleanup" : "Cancel request")}
        </Button>
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
