import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api } from "@/lib/api"
import { Loading, Notice } from "./feedback"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { toast } from "./ui/toast"

export function PullRequestAction({
  api,
  worktreeId,
  disabled,
  onBusyChange,
}: {
  api: Api
  worktreeId: string
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [inspection, setInspection] = useState<Awaited<
    ReturnType<Api["pullRequestInspection"]>
  > | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<Api["publishPullRequest"]>> | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  useEffect(() => {
    if (!open) {
      return
    }
    const controller = new AbortController()
    setInspection(null)
    setResult(null)
    setError("")
    setBody("")
    void api
      .pullRequestInspection(worktreeId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setInspection(data)
          setTitle(data.title)
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => controller.abort()
  }, [api, worktreeId, open])

  async function publish() {
    if (!inspection || running.current) {
      return
    }
    running.current = true
    setBusy(true)
    onBusyChange(true)
    setError("")
    try {
      const { existing: _, ...target } = inspection
      setResult(await api.publishPullRequest(worktreeId, { ...target, title, body }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      running.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="toolbar"
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {t("PR")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!running.current) {
            setOpen(next)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t("Publish PR")}</DialogTitle>
            <DialogDescription>
              {t("Push this branch and publish a pull request. Remote merging is separate.")}
            </DialogDescription>
          </DialogHeader>
          {error && <Notice>{t(error)}</Notice>}
          {!inspection && !error && <Loading>{t("Preparing PR…")}</Loading>}
          {result ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                {t("PR #{{number}} is available", { number: result.number })}
              </p>
              <Input
                aria-label={t("PR URL")}
                value={result.url}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t("Close")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(result.url)
                      .then(() => {
                        toast.add({ title: t("Copied"), type: "success" })
                      })
                      .catch(() => {
                        toast.add({ title: t("Copy failed. Select the PR URL."), type: "error" })
                      })
                  }}
                >
                  {t("Copy PR link")}
                </Button>
              </div>
            </div>
          ) : (
            inspection && (
              <form
                className="flex min-w-0 flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void publish()
                }}
              >
                <p className="break-all text-sm text-muted-foreground">
                  {inspection.repository}
                  <br />
                  {inspection.branch} → {inspection.baseBranch}
                </p>
                {inspection.existing && (
                  <p className="text-sm">
                    {t("PR #{{number}} already exists. Push updates to this PR.", {
                      number: inspection.existing.number,
                    })}
                  </p>
                )}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="pr-title">{t("PR title")}</FieldLabel>
                    <Input
                      id="pr-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={256}
                      required
                      disabled={busy || Boolean(inspection.existing)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pr-body">{t("PR description")}</FieldLabel>
                    <Textarea
                      id="pr-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      maxLength={60000}
                      disabled={busy || Boolean(inspection.existing)}
                    />
                  </Field>
                </FieldGroup>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button type="submit" disabled={busy || !title.trim()}>
                    {busy ? t("Publishing…") : t(inspection.existing ? "Push to PR" : "Publish PR")}
                  </Button>
                </div>
              </form>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
