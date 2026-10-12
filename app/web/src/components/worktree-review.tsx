import { useTranslation } from "react-i18next"
import { CaptureReview } from "./capture-review"
import { ExecutionLog } from "./execution-log"
import { EmptyState, Loading, Notice } from "./feedback"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { ReviewToolbar } from "./review-toolbar"
import { UnitTests } from "./unit-tests"
import { WorktreeEnvironments } from "./worktree-environments"
import { WorktreeMergeActions } from "./worktree-merge"
import "@/locales"
import { useCallback, useEffect, useMemo, useState } from "react"
import { parseDiff } from "react-diff-view"
import type { Api, GitDiff } from "@/lib/api"
import { reviewContent } from "@/lib/review-content"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { ChangedFileList } from "./changed-file-list"
import { FileDiff } from "./image-diff"
import { TestObservation } from "./test-observation"
import { Tabs, TabsContent, TabsTrigger } from "./ui/coss-tabs"
import { toast } from "./ui/toast"

export function WorktreeReview(props: {
  api: Api
  worktreeId: string
  initialTab?: "unit" | "tests"
  initialGitView?: boolean
}) {
  return (
    <LiveUpdates worktreeId={props.worktreeId}>
      <WorktreeReviewContent {...props} />
    </LiveUpdates>
  )
}
function WorktreeReviewContent(props: {
  api: Api
  worktreeId: string
  initialTab?: "unit" | "tests"
  initialGitView?: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <WorktreeReviewTabs key={props.worktreeId} {...props} />
    </div>
  )
}

function WorktreeReviewTabs({
  api,
  worktreeId,
  initialTab,
  initialGitView,
}: {
  api: Api
  worktreeId: string
  initialTab?: "unit" | "tests"
  initialGitView?: boolean
}) {
  const { t } = useTranslation()

  const [previewVisited, setPreviewVisited] = useState(false)
  const [selection, setSelection] = useState({ worktreeId, path: "" })
  const selectedPath = selection.worktreeId === worktreeId ? selection.path : ""
  const onSelectPath = (path: string) => setSelection({ worktreeId, path })
  const [unitVisited, setUnitVisited] = useState(initialTab === "unit")
  const [testsVisited, setTestsVisited] = useState(initialTab === "tests")
  const [logVisited, setLogVisited] = useState(false)
  const [previewActions, setPreviewActions] = useState<HTMLDivElement | null>(null)
  const [unitActions, setUnitActions] = useState<HTMLDivElement | null>(null)
  const [testActions, setTestActions] = useState<HTMLDivElement | null>(null)
  const [requestedTab, setTab] = useState<string>(initialTab ?? "changes")
  const [contentReady, setContentReady] = useState(false)
  const [content, setContent] = useState<Record<string, boolean>>({
    changes: true,
    preview: true,
    unit: true,
    tests: true,
    log: true,
    environment: true,
  })
  const onGitContent = useCallback(
    (visible: boolean) =>
      setContent((current) =>
        current.changes === visible ? current : { ...current, changes: visible },
      ),
    [],
  )
  const revision = useLiveRevision()
  const refreshContent = useCallback(
    async (signal: AbortSignal) => {
      const next = await reviewContent(api, worktreeId, signal)
      if (!signal.aborted) {
        setContent((current) => ({ ...current, ...next }))
        setContentReady(true)
      }
    },
    [api, worktreeId],
  )
  useRefreshRequest(refreshContent, revision)
  const tab =
    !contentReady || content?.[requestedTab]
      ? requestedTab
      : (Object.keys(content ?? {}).find((key) => content?.[key]) ?? "")

  useEffect(() => {
    if (requestedTab !== tab) {
      setTab(tab)
    }
  }, [requestedTab, tab])

  const navigation = (
    <>
      {content?.changes && <TabsTrigger value="changes">{t("Diff")}</TabsTrigger>}
      {content?.preview && <TabsTrigger value="preview">{t("UI Review")}</TabsTrigger>}
      {content?.unit && <TabsTrigger value="unit">{t("Unit Test")}</TabsTrigger>}
      {content?.tests && <TabsTrigger value="tests">{t("Integration Test")}</TabsTrigger>}
      {content?.log && <TabsTrigger value="log">{t("Log")}</TabsTrigger>}
      {content?.environment && <TabsTrigger value="environment">{t("Environment")}</TabsTrigger>}
    </>
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(String(value))
        if (value === "preview") {
          setPreviewVisited(true)
        }
        if (value === "unit") {
          setUnitVisited(true)
        }
        if (value === "tests") {
          setTestsVisited(true)
        }
        if (value === "log") {
          setLogVisited(true)
        }
      }}
      className="min-h-0 min-w-0 flex-1 gap-0 overflow-hidden"
    >
      <ReviewToolbar
        singleRow
        actions={
          <>
            <div ref={setPreviewActions} hidden={tab !== "preview"} />
            <div ref={setUnitActions} hidden={tab !== "unit"} />
            <div ref={setTestActions} hidden={tab !== "tests"} />
            <WorktreeMergeActions
              key={worktreeId}
              api={api}
              worktreeId={worktreeId}
              initialOpen={initialGitView}
            />
          </>
        }
      >
        {contentReady && navigation}
      </ReviewToolbar>
      {content && !tab && <EmptyState>{t("No review content yet.")}</EmptyState>}
      <TabsContent
        value="changes"
        keepMounted
        className="flex h-0 min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <LiveUpdates worktreeId={worktreeId}>
          <GitChanges
            key={worktreeId}
            active={tab === "changes"}
            onContent={onGitContent}
            api={api}
            worktreeId={worktreeId}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
          />
        </LiveUpdates>
      </TabsContent>
      <TabsContent
        value="preview"
        keepMounted
        className="flex h-0 min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <LiveUpdates worktreeId={worktreeId} scope="preview" enabled={tab === "preview"}>
          {(previewVisited || tab === "preview") && (
            <CaptureReview
              key={worktreeId}
              api={api}
              worktreeId={worktreeId}
              actionsContainer={previewActions}
            />
          )}
        </LiveUpdates>
      </TabsContent>
      <TabsContent
        value="unit"
        keepMounted
        className="flex h-0 min-h-0 min-w-0 flex-col overflow-auto"
      >
        {(unitVisited || tab === "unit") && (
          <LiveUpdates worktreeId={worktreeId} scope="unit" enabled={tab === "unit"}>
            <UnitTests
              key={worktreeId}
              api={api}
              worktreeId={worktreeId}
              actionsContainer={unitActions}
            />
          </LiveUpdates>
        )}
      </TabsContent>
      <TabsContent
        value="tests"
        keepMounted
        className="flex h-0 min-h-0 min-w-0 flex-col gap-3 overflow-hidden"
      >
        {(testsVisited || tab === "tests") && (
          <LiveUpdates worktreeId={worktreeId} scope="tests" enabled={tab === "tests"}>
            <TestObservation
              key={worktreeId}
              api={api}
              worktreeId={worktreeId}
              actionsContainer={testActions}
            />
          </LiveUpdates>
        )}
      </TabsContent>
      <TabsContent value="log" keepMounted className="h-0 min-h-0 min-w-0 overflow-auto p-4">
        {(logVisited || tab === "log") && (
          <LiveUpdates worktreeId={worktreeId} scope="evidence" enabled={tab === "log"}>
            <ExecutionLog key={worktreeId} api={api} worktreeId={worktreeId} />
          </LiveUpdates>
        )}
      </TabsContent>
      <TabsContent value="environment" className="h-0 min-h-0 min-w-0 overflow-auto p-4">
        <WorktreeEnvironments api={api} worktreeId={worktreeId} />
      </TabsContent>
    </Tabs>
  )
}

function GitChanges({
  api,
  worktreeId,
  active,
  selectedPath,
  onSelectPath,
  onContent,
}: {
  active: boolean
  onContent: (visible: boolean) => void
  api: Api
  worktreeId: string
  selectedPath: string
  onSelectPath: (path: string) => void
}) {
  const { t } = useTranslation()

  const [result, setResult] = useState<GitDiff | null>(null)
  const [error, setError] = useState("")
  const liveRevision = useLiveRevision()
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.gitDiff(worktreeId, "all", signal)
        if (!signal.aborted) {
          setResult(next)
          setError("")
        }
      } catch (error) {
        if (!signal.aborted) {
          setError(error instanceof Error ? error.message : t("Git diff unavailable"))
        }
      }
    },
    [api, worktreeId, t],
  )
  useRefreshRequest(refresh, liveRevision)
  const parsed = useMemo(() => {
    try {
      return { files: parseGitPatch(result?.patch ?? ""), error: "" }
    } catch {
      return { files: [], error: t("This Git patch could not be displayed.") }
    }
  }, [result?.patch, t])
  const failure = error || parsed.error
  useEffect(() => {
    if (result || failure) {
      onContent(
        Boolean(failure) ||
          !result?.available ||
          Boolean(result?.patch) ||
          Boolean(result?.omitted.length),
      )
    }
  }, [result, failure, onContent])
  useEffect(() => {
    if (!active || !failure) {
      return
    }
    const id = toast.add({
      title: t("{{error}} · Displayed changes may be outdated.", { error: failure }),
      type: "error",
      timeout: 5000,
    })
    return () => toast.close(id)
  }, [active, failure, t])
  const file = selectedPath
    ? parsed.files.find((file) => (file.newPath || file.oldPath) === selectedPath)
    : parsed.files[0]
  function renderChanges() {
    if (!result && error) {
      return <EmptyState>{t("No displayable text diff.")}</EmptyState>
    }
    if (!result) {
      return <Loading>{t("Loading Git changes…")}</Loading>
    }
    if (!result.available) {
      return <Notice>{t("Git unavailable: {{reason}}", { reason: result.reason })}</Notice>
    }
    return (
      <>
        {result.omitted.length > 0 && (
          <Notice>
            <p>{t("Some files could not be previewed:")}</p>
            {result.omitted.map((reason) => (
              <p key={reason} className="break-all">
                {reason}
              </p>
            ))}
          </Notice>
        )}
        {!parsed.files.length ? (
          <EmptyState>
            {result.omitted.length || parsed.error
              ? t("No displayable text diff.")
              : t("No changes in this comparison.")}
          </EmptyState>
        ) : (
          <div
            style={{ containerType: "inline-size", containerName: "workspace" }}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <div className="review-layout h-full">
              <section className="review-list min-h-0 min-w-0 flex-col border-r">
                <ChangedFileList
                  key={parsed.files.map((file) => `${file.newPath}:${file.type}`).join("|")}
                  files={parsed.files}
                  selectedPath={path}
                  onSelect={onSelectPath}
                />
              </section>
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                {file && <FileDiff api={api} worktreeId={worktreeId} file={file} />}
                {!file && <EmptyState>{t("No text diff for the selected file.")}</EmptyState>}
              </section>
            </div>
          </div>
        )}
      </>
    )
  }
  const path = selectedPath || (file ? file.newPath || file.oldPath : "")
  return (
    <section aria-label={t("Git changes")} className="flex min-h-0 flex-1 flex-col gap-3">
      {renderChanges()}
    </section>
  )
}

export function parseGitPatch(patch: string) {
  return parseDiff(patch)
    .filter((file) => file.newPath || file.oldPath)
    .map((file) => (file.newPath === "/dev/null" ? { ...file, newPath: file.oldPath } : file))
}
