import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, CaptureRun, Worktree } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { SearchPicker } from "./search-picker"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Field, FieldGroup, FieldLabel } from "./ui/field"

export function ProjectPlaywrightAction({
  api,
  projectId,
  onRun,
}: {
  api: Api
  projectId: string
  onRun: (run: CaptureRun) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return (
    <>
      <Button variant="ghost" size="toolbar" onClick={() => setOpen(true)}>
        {t("Run Playwright")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Run Playwright")}</DialogTitle>
          </DialogHeader>
          {open && (
            <ExecutionForm
              api={api}
              projectId={projectId}
              pending={pending}
              setPending={setPending}
              onRun={(run) => {
                onRun(run)
                setOpen(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ExecutionForm({
  api,
  projectId,
  pending,
  setPending,
  onRun,
}: {
  api: Api
  projectId: string
  pending: boolean
  setPending: (pending: boolean) => void
  onRun: (run: CaptureRun) => void
}) {
  const { t } = useTranslation()
  const [worktrees, setWorktrees] = useState<Worktree[] | null>(null)
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.worktrees(projectId, signal)
        if (!signal.aborted) {
          setWorktrees(next)
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, projectId],
  )
  useRefreshRequest(refresh, useLiveRevision())
  const worktree = worktrees?.find((item) => item.id === selected) ?? worktrees?.[0]
  return (
    <FieldGroup>
      {error && <Notice error>{error}</Notice>}
      {!worktrees && !error && <Loading>{t("Loading…")}</Loading>}
      <Field>
        <FieldLabel>{t("Worktree")}</FieldLabel>
        <SearchPicker
          label={t("Worktree")}
          value={worktree?.id ?? ""}
          disabled={pending || !worktrees?.length}
          onValueChange={setSelected}
          options={(worktrees ?? []).map((item) => ({
            value: item.id,
            label: `${item.branch ?? item.checkoutRoot} · ${item.checkoutRoot}`,
          }))}
        />
      </Field>
      {worktree && !error && (
        <TargetExecution
          key={worktree.id}
          api={api}
          worktreeId={worktree.id}
          pending={pending}
          setPending={setPending}
          onRun={onRun}
        />
      )}
    </FieldGroup>
  )
}

function TargetExecution({
  api,
  worktreeId,
  pending,
  setPending,
  onRun,
}: {
  api: Api
  worktreeId: string
  pending: boolean
  setPending: (pending: boolean) => void
  onRun: (run: CaptureRun) => void
}) {
  const { t } = useTranslation()
  const [data, setData] = useState<Awaited<ReturnType<Api["playwright"]>> | null>(null)
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const [failure, setFailure] = useState("")
  const running = useRef(false)
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.playwright(worktreeId, signal)
        if (!signal.aborted) {
          setData(next)
          setError(next.error ?? "")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(String(cause))
        }
      }
    },
    [api, worktreeId],
  )
  useRefreshRequest(refresh, useLiveRevision())
  const targets = Object.entries(data?.settings?.targets ?? {})
  const target = targets.find(([name]) => name === selected)?.[0] ?? targets[0]?.[0]
  const blocked =
    pending ||
    !target ||
    Boolean(error) ||
    data?.runs.some((run) => run.state !== "finished" || Boolean(run.cleanupError))
  async function execute() {
    if (blocked || running.current) {
      return
    }
    running.current = true
    setPending(true)
    setFailure("")
    try {
      onRun(await api.runPlaywright(worktreeId, undefined, undefined, target))
    } catch (cause) {
      setFailure(String(cause))
    } finally {
      running.current = false
      setPending(false)
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {failure && <Notice error>{failure}</Notice>}
      {data && !data.settings && (
        <Notice>
          {t("Configure Playwright in Project settings to capture application flows.")}
        </Notice>
      )}
      <Field>
        <FieldLabel>{t("Playwright target")}</FieldLabel>
        <SearchPicker
          label={t("Playwright target")}
          value={target ?? ""}
          disabled={pending || targets.length === 0}
          onValueChange={setSelected}
          options={targets.map(([name, value]) => ({
            value: name,
            label: `${name} · ${value.purpose}`,
          }))}
        />
      </Field>
      <div className="flex justify-end">
        <Button disabled={Boolean(blocked)} onClick={() => void execute()}>
          {t("Run Playwright")}
        </Button>
      </div>
    </>
  )
}
