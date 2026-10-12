import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, GitDiff } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { EmptyState, Loading, Notice } from "./feedback"
import { FileDiff } from "./image-diff"
import { useLiveRevision } from "./live-updates"
import { TestFileBrowser } from "./test-file-browser"
import { parseGitPatch } from "./worktree-review"

export function BranchReview({
  api,
  projectId,
  branch,
}: {
  api: Api
  projectId: string
  branch: string
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState("")
  const liveRevision = useLiveRevision()
  const [result, setResult] = useState<GitDiff | null>(null)
  const [error, setError] = useState("")
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const next = await api.branchDiff(projectId, branch, signal)
        if (!signal.aborted) {
          setResult(next)
          setError("")
        }
      } catch (error) {
        if (!signal.aborted) {
          setError(error instanceof Error ? error.message : String(error))
        }
      }
    },
    [api, projectId, branch],
  )
  useRefreshRequest(refresh, liveRevision)
  const parsed = useMemo(() => {
    try {
      return { files: parseGitPatch(result?.patch ?? ""), error: "" }
    } catch {
      return { files: [], error: t("This Git patch could not be displayed.") }
    }
  }, [result, t])
  const selected =
    parsed.files.find((file) => (file.type === "delete" ? file.oldPath : file.newPath) === path) ??
    parsed.files[0]
  let selectedPath = ""
  if (selected) {
    selectedPath = selected.type === "delete" ? selected.oldPath : selected.newPath
  }
  return (
    <section
      aria-label={t("Committed branch changes")}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {t("No working directory. Only committed changes are shown.")}
      </p>
      {(error || parsed.error) && <Notice error>{error || parsed.error}</Notice>}
      {!result && !error && <Loading>{t("Loading Git changes…")}</Loading>}
      {result && !result.available && <Notice>{result.reason}</Notice>}
      {result?.available && !parsed.files.length && (
        <EmptyState>{t("No changes in this comparison.")}</EmptyState>
      )}
      <TestFileBrowser
        files={parsed.files.map((file) => ({
          path: file.type === "delete" ? file.oldPath : file.newPath,
        }))}
        path={selectedPath}
        onSelect={setPath}
        label={t("Select changed file")}
      >
        {selected && (
          <FileDiff
            api={api}
            projectId={projectId}
            file={selected}
            before={result?.baseRevision}
            after={result?.revision ?? undefined}
          />
        )}
      </TestFileBrowser>
    </section>
  )
}
