import { useEffect, useState } from "react"
import type { FileData } from "react-diff-view"
import { useTranslation } from "react-i18next"
import type { Api, GitDiff } from "@/lib/api"
import { ChangedFileList } from "./changed-file-list"
import { EmptyState, Loading } from "./feedback"
import { FileDiff } from "./image-diff"
import { Button } from "./ui/button"
import { toast } from "./ui/toast"
import { parseGitPatch } from "./worktree-review"

export function CommitChanges({
  api,
  projectId,
  oid,
  onClose,
}: {
  api: Api
  projectId: string
  oid: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [comparison, setComparison] = useState<GitDiff | null>(null)
  const [files, setFiles] = useState<FileData[]>([])
  const [path, setPath] = useState("")
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads the same immutable commit.
  useEffect(() => {
    const request = new AbortController()
    let toastId: string | undefined
    setLoading(true)
    setFailed(false)
    void api
      .commitDiff(projectId, oid, request.signal)
      .then((result) => {
        if (request.signal.aborted) {
          return
        }
        if (!result.available) {
          throw new Error(result.reason)
        }
        let next: FileData[]
        try {
          next = parseGitPatch(result.patch)
        } catch {
          throw new Error(t("This Git patch could not be displayed."))
        }
        setComparison(result)
        setFiles(next)
        setPath(next[0]?.newPath || next[0]?.oldPath || "")
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted) {
          setFailed(true)
          toastId = toast.add({
            title: error instanceof Error ? error.message : String(error),
            type: "error",
          })
        }
      })
      .finally(() => {
        if (!request.signal.aborted) {
          setLoading(false)
        }
      })
    return () => {
      request.abort()
      if (toastId) {
        toast.close(toastId)
      }
    }
  }, [api, projectId, oid, attempt, t])
  const file = files.find((item) => (item.newPath || item.oldPath) === path)
  return (
    <section
      aria-label={t("Commit changes")}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t"
      style={{ containerType: "inline-size", containerName: "workspace" }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1">
        <span className="text-sm">
          {t("Commit changes")} <code>{oid.slice(0, 8)}</code>
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("Close")}
        </Button>
      </div>
      {loading && <Loading>{t("Loading Git changes…")}</Loading>}
      {!loading && failed && (
        <div className="p-3">
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("Retry")}
          </Button>
        </div>
      )}
      {!loading && !failed && !files.length && (
        <EmptyState>{t("No changes in this comparison.")}</EmptyState>
      )}
      {!loading && !failed && files.length > 0 && (
        <div className="review-layout min-h-0 flex-1">
          <div className="review-list min-h-0 min-w-0 border-r">
            <ChangedFileList files={files} selectedPath={path} onSelect={setPath} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {file && (
              <FileDiff
                api={api}
                projectId={projectId}
                file={file}
                before={comparison?.baseRevision}
                after={comparison?.revision ?? undefined}
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
