import { useCallback, useMemo, useState } from "react"
import { parseDiff } from "react-diff-view"
import { useTranslation } from "react-i18next"
import type { Api, GitDiff } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { Loading, Notice } from "./feedback"
import { FileDiff } from "./image-diff"
import { useLiveRevision } from "./live-updates"
import { UnifiedDiff } from "./unified-diff"

type TestCodeProps = {
  api: Api
  worktreeId: string
  baseRevision?: string
  source: { path: string; content: string }
  scope: "changed" | "all"
}

export function TestCode(props: TestCodeProps) {
  if (props.scope === "all") {
    return <UnifiedDiff source={props.source} />
  }
  return <ChangedTestCode key={props.worktreeId} {...props} />
}

function ChangedTestCode({ api, worktreeId, source, baseRevision }: TestCodeProps) {
  const { t } = useTranslation()
  const [result, setResult] = useState<GitDiff | null>(null)
  const [error, setError] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.gitDiff(worktreeId, "all", signal)
        if (!signal.aborted) {
          setResult(next)
          setError("")
        }
      } catch (cause) {
        if (!signal.aborted) {
          setResult(null)
          setError(String(cause))
        }
      }
    },
    [api, worktreeId],
  )
  useRefreshRequest(refresh, useLiveRevision())
  const parsed = useMemo(() => {
    try {
      return { files: parseDiff(result?.patch ?? ""), error: "" }
    } catch {
      return { files: [], error: t("This Git patch could not be displayed.") }
    }
  }, [result?.patch, t])
  const file = parsed.files.find((file) => file.newPath === source.path && file.type !== "delete")
  const unavailable =
    error ||
    parsed.error ||
    (result &&
      (!result.available || !file || (baseRevision && result.baseRevision !== baseRevision)))
  if (unavailable) {
    return <Notice>{t("Changes unavailable.")}</Notice>
  }
  if (!result) {
    return <Loading>{t("Loading changes…")}</Loading>
  }
  return file ? <FileDiff api={api} worktreeId={worktreeId} file={file} /> : null
}
