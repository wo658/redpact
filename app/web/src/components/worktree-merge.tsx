import { useCallback, useMemo, useRef, useState } from "react"
import { parseDiff } from "react-diff-view"
import { useTranslation } from "react-i18next"
import type { Api, MergeInspection, MergeRecord, Uncommitted } from "@/lib/api"
import { ApiError } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { CopyHandoff } from "./copy-handoff"
import { EmptyState, Loading, Notice } from "./feedback"
import { FileDiff } from "./image-diff"
import { useLiveRevision } from "./live-updates"
import { PullRequestAction } from "./pull-request"
import { TestFileBrowser } from "./test-file-browser"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { toast } from "./ui/toast"

export function useMergeInspection(api: Api, worktreeId: string) {
  const [data, setData] = useState<MergeInspection | null>(null)
  const [error, setError] = useState("")
  const [refreshId, setRefreshId] = useState(0)
  const live = useLiveRevision()
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.mergeInspection(worktreeId, signal)
        if (!signal.aborted) {
          setData(next)
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    },
    [api, worktreeId],
  )
  useRefreshRequest(refresh, live, refreshId)
  return { data, error, reload: () => setRefreshId((value) => value + 1) }
}

export function WorktreeMergeActions({
  api,
  worktreeId,
  initialOpen = false,
}: {
  api: Api
  worktreeId: string
  initialOpen?: boolean
}) {
  const { t } = useTranslation()
  const { data, reload } = useMergeInspection(api, worktreeId)
  const [open, setOpen] = useState(initialOpen)
  const [busy, setBusy] = useState(false)
  const [prBusy, setPrBusy] = useState(false)
  const [failure, setFailure] = useState("")
  const [result, setResult] = useState<MergeRecord | null>(null)
  const request = useRef<Parameters<Api["mergeWorktree"]>[1] | null>(null)
  const running = useRef(false)
  async function merge() {
    if (running.current) {
      return
    }
    running.current = true
    setBusy(true)
    setFailure("")
    try {
      const current = await api.mergeInspection(worktreeId)
      if (!request.current && (current.blockedReason || !current.target)) {
        setOpen(true)
        return
      }
      if (!request.current && current.target) {
        request.current = {
          requestId: crypto.randomUUID(),
          sourceRevision: current.source.revision,
          targetRevision: current.target.revision,
        }
      }
      if (!request.current) {
        return
      }
      const record = await api.mergeWorktree(worktreeId, request.current)
      setResult(record)
      if (record.state !== "running") {
        request.current = null
      }
      const completed = record.state === "merged" && !record.cleanupError
      setOpen(!completed)
      toast.add({
        title: completed ? t("Merge completed") : t("Merge needs attention"),
        type: completed ? "success" : "error",
      })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        request.current = null
      }
      setFailure(cause instanceof Error ? cause.message : String(cause))
      setOpen(true)
    } finally {
      running.current = false
      setBusy(false)
      reload()
    }
  }
  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {data?.source.dirty && (
          <Button
            variant="ghost"
            size="toolbar"
            disabled={busy || prBusy}
            onClick={() => setOpen(true)}
          >
            {t("Uncommitted changes ({{count}})", { count: data.source.files.length })}
          </Button>
        )}
        <Button
          variant="ghost"
          size="toolbar"
          disabled={busy || prBusy}
          onClick={() => void merge()}
        >
          {busy ? t("Merging…") : t("Merge")}
        </Button>
        <PullRequestAction
          api={api}
          worktreeId={worktreeId}
          disabled={busy}
          onBusyChange={setPrBusy}
        />
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next)
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(48rem,90dvh)] w-[calc(100%-2rem)] sm:max-w-5xl flex-col overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>{t("Worktree merge")}</DialogTitle>
          </DialogHeader>
          <WorktreeMerge
            api={api}
            worktreeId={worktreeId}
            onBack={() => setOpen(false)}
            onMerge={merge}
            pending={busy}
            onBusyChange={setBusy}
            failure={failure}
            result={result}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function WorktreeMerge({
  api,
  worktreeId,
  onBack,
  onMerge,
  pending = false,
  onBusyChange,
  failure = "",
  result,
}: {
  api: Api
  worktreeId: string
  onBack: () => void
  onMerge: () => Promise<void>
  pending?: boolean
  onBusyChange?: (busy: boolean) => void
  failure?: string
  result?: MergeRecord | null
}) {
  const { t } = useTranslation()
  const { data, error, reload } = useMergeInspection(api, worktreeId)
  const [acting, setBusy] = useState(false)
  const busy = acting || pending
  const [message, setMessage] = useState("")
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitRevision, setCommitRevision] = useState("")
  const [discard, setDiscard] = useState<Uncommitted | null>(null)
  const [selected, setSelected] = useState("")
  async function act(operation: () => Promise<unknown>) {
    setBusy(true)
    onBusyChange?.(true)
    try {
      await operation()
    } catch (cause) {
      toast.add({ title: cause instanceof Error ? cause.message : String(cause), type: "error" })
    } finally {
      setBusy(false)
      onBusyChange?.(false)
      reload()
    }
  }
  return (
    <section
      aria-label={t("Worktree merge")}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          {t("Close")}
        </Button>
        <span className="text-sm">
          {data?.source.branch} → {data?.targetBranch}
        </span>
        <Button
          className="ml-auto"
          disabled={busy || Boolean(error) || !data || Boolean(data.blockedReason) || !data.target}
          onClick={() => void act(onMerge)}
        >
          {t("Merge into {{branch}}", { branch: data?.targetBranch ?? "…" })}
        </Button>
      </div>
      {failure && <Notice>{failure}</Notice>}
      {error && <Notice>{error}</Notice>}
      {!data && !error && <Loading>{t("Loading Git changes…")}</Loading>}
      {data && (
        <>
          {data.blockedReason && <Notice>{t(data.blockedReason)}</Notice>}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {t("Uncommitted changes ({{count}})", { count: data.source.files.length })}
              </Badge>
              <Button
                variant="outline"
                disabled={
                  busy || Boolean(error) || !data.source.dirty || Boolean(data.source.blockedReason)
                }
                onClick={() => {
                  setCommitRevision(data.source.revision)
                  setCommitOpen(true)
                }}
              >
                {t("Commit")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  busy || Boolean(error) || !data.source.dirty || Boolean(data.source.blockedReason)
                }
                onClick={() => setDiscard(structuredClone(data.source))}
              >
                {t("Discard changes")}
              </Button>
            </div>
            {commitOpen && (
              <form
                className="shrink-0"
                onSubmit={(event) => {
                  event.preventDefault()
                  const revision = commitRevision
                  void act(async () => {
                    await api.commitChanges(worktreeId, revision, message)
                    setCommitOpen(false)
                    setMessage("")
                    toast.add({
                      title: t("Changes committed. Review before merging."),
                      type: "success",
                    })
                  })
                }}
              >
                {commitRevision !== data.source.revision && (
                  <Notice>{t("Changes have changed since inspection; review them again")}</Notice>
                )}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="merge-commit-message">{t("Commit message")}</FieldLabel>
                    <Input
                      id="merge-commit-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      disabled={busy}
                      maxLength={10000}
                      required
                    />
                  </Field>
                </FieldGroup>
                <p className="py-2 text-sm text-muted-foreground">
                  {t("All listed staged, unstaged and untracked changes will be committed.")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={
                      busy ||
                      Boolean(error) ||
                      !message.trim() ||
                      !data.source.dirty ||
                      commitRevision !== data.source.revision
                    }
                  >
                    {t("Commit all changes")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setCommitOpen(false)}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              </form>
            )}
            {data.source.dirty ? (
              <UncommittedChanges
                api={api}
                worktreeId={worktreeId}
                source={data.source}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <EmptyState compact>{t("Working tree is clean.")}</EmptyState>
            )}
            {(result
              ? [result, ...data.records.filter((record) => record.id !== result.id)]
              : data.records
            ).map((record) => (
              <MergeResult key={record.id} record={record} />
            ))}
          </div>
        </>
      )}
      <AlertDialog
        open={Boolean(discard)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDiscard(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Discard all listed changes?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Tracked files will be restored to HEAD. Listed untracked files will be deleted. Ignored files are preserved. This cannot be undone by Redpact.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 overflow-auto text-sm">
            {discard?.files.map((file) => (
              <li key={file.path} className="break-all">
                {file.path}
                {file.untracked && <> · {t("Delete untracked file")}</>}
              </li>
            ))}
          </ul>
          {discard && discard.revision !== data?.source.revision && (
            <Notice>{t("Changes have changed since inspection; review them again")}</Notice>
          )}
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDiscard(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy || Boolean(error) || !discard || discard.revision !== data?.source.revision
              }
              onClick={() => {
                if (discard) {
                  const revision = discard.revision
                  void act(async () => {
                    await api.discardChanges(worktreeId, revision)
                    setDiscard(null)
                    setCommitOpen(false)
                  })
                }
              }}
            >
              {t("Discard all listed changes")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
function UncommittedChanges({
  api,
  worktreeId,
  source,
  selected,
  onSelect,
}: {
  api: Api
  worktreeId: string
  source: Uncommitted
  selected: string
  onSelect: (path: string) => void
}) {
  const { t } = useTranslation()
  const path = source.files.some((file) => file.path === selected)
    ? selected
    : source.files[0]?.path
  const selectedFile = source.files.find((file) => file.path === path)
  const patches = useMemo(
    () =>
      [source.staged, source.unstaged].map((diff) => {
        try {
          return { files: parseDiff(diff.patch), error: "" }
        } catch {
          return { files: [], error: "This Git patch could not be displayed." }
        }
      }),
    [source.staged, source.unstaged],
  )
  return (
    <div className="flex h-96 min-h-64 shrink-0 flex-col gap-3 rounded-md border p-3">
      <TestFileBrowser
        files={source.files}
        path={path ?? ""}
        onSelect={onSelect}
        label={t("Select changed file")}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex gap-2">
            {selectedFile?.staged && <Badge variant="secondary">{t("Staged")}</Badge>}
            {selectedFile?.unstaged && <Badge variant="secondary">{t("Unstaged")}</Badge>}
            {selectedFile?.untracked && <Badge variant="secondary">{t("Untracked")}</Badge>}
          </div>
          {[source.staged, source.unstaged].map((diff, index) => {
            const file = patches[index].files.find(
              (file) => file.newPath === path || file.oldPath === path,
            )
            const label = index === 0 ? t("Staged") : t("Unstaged and untracked")
            return (
              <section
                key={label}
                aria-label={label}
                className="flex h-96 min-w-0 shrink-0 flex-col"
              >
                <p className="py-2 text-sm font-medium">{label}</p>
                {!diff.available && <Notice>{diff.reason}</Notice>}
                {patches[index].error && <Notice>{t(patches[index].error)}</Notice>}
                {diff.omitted.map((reason) => (
                  <Notice key={reason}>{reason}</Notice>
                ))}
                {file ? (
                  <FileDiff
                    api={api}
                    worktreeId={worktreeId}
                    file={file}
                    scope={index === 0 ? "staged" : "unstaged"}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("No changes in this comparison.")}
                  </p>
                )}
              </section>
            )
          })}
        </div>
      </TestFileBrowser>
    </div>
  )
}
function MergeResult({ record }: { record: MergeRecord }) {
  const { t } = useTranslation()
  if (record.state !== "merged" && record.state !== "running") {
    return (
      <CopyHandoff
        context={{
          title: t("Resolve merge issue"),
          summary: record.error ?? t("Merge requires recovery."),
          fields: [
            [t("Source worktree"), record.sourceRoot],
            [t("Target worktree"), record.targetRoot],
            [t("State"), record.state],
            [t("Conflicting paths"), record.conflicts.join(", ") || "none recorded"],
            [t("Recovery request"), record.resolutionRequest],
          ],
          diagnostics: record.output ? [[t("Git output"), record.output]] : undefined,
        }}
        details={
          record.output
            ? {
                label: t("Git output"),
                children: (
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">{record.output}</pre>
                ),
              }
            : undefined
        }
      >
        <MergeSummary record={record} />
      </CopyHandoff>
    )
  }
  return (
    <section className="shrink-0 rounded-md border p-3">
      <MergeSummary record={record} />
      {record.output && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {t("Git output")}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="overflow-auto whitespace-pre-wrap text-xs">{record.output}</pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  )
}
function MergeSummary({ record }: { record: MergeRecord }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t(record.state)}</Badge>
        <span className="text-xs text-muted-foreground">{record.createdAt}</span>
      </div>
      <p className="break-all py-2 text-xs">
        {record.sourceBranch} ({record.sourceHead.slice(0, 8)}) → {record.targetBranch} (
        {record.targetHead.slice(0, 8)})
      </p>
      {record.error && <p className="whitespace-pre-wrap break-words text-sm">{record.error}</p>}
      {record.cleanupError && <Notice>{record.cleanupError}</Notice>}
    </>
  )
}
