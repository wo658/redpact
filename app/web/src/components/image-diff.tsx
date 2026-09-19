import { useEffect, useState } from "react"
import type { FileData } from "react-diff-view"
import { useTranslation } from "react-i18next"
import type { Api, GitImage } from "@/lib/api"
import { EmptyState, Loading } from "./feedback"
import { ImagePreview, isImagePath } from "./image-preview"
import { useLiveRevision } from "./live-updates"
import { UnifiedDiff } from "./unified-diff"

export { isImagePath } from "./image-preview"

type Props = {
  api: Api
  file: FileData
  worktreeId?: string
  projectId?: string
  before?: string
  after?: string
  scope?: "all" | "staged" | "unstaged"
}

export function FileDiff(props: Props) {
  const path = props.file.type === "delete" ? props.file.oldPath : props.file.newPath
  return isImagePath(path) ? (
    <ImageDiff
      key={JSON.stringify([
        path,
        props.worktreeId,
        props.projectId,
        props.before,
        props.after,
        props.scope,
      ])}
      {...props}
      path={path}
    />
  ) : (
    <UnifiedDiff file={props.file} />
  )
}

function ImageDiff({
  api,
  file,
  path,
  worktreeId,
  projectId,
  before,
  after,
  scope = "all",
}: Props & { path: string }) {
  const { t } = useTranslation()
  const revision = useLiveRevision()
  const [result, setResult] = useState<GitImage | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    void revision
    const abort = new AbortController()
    setError("")
    let pending: Promise<GitImage>
    if (worktreeId) {
      pending = api.gitImage(worktreeId, path, abort.signal, scope)
    } else if (projectId && after) {
      pending = api.committedImage(
        projectId,
        { path, oldPath: file.oldPath === "/dev/null" ? undefined : file.oldPath, before, after },
        abort.signal,
      )
    } else {
      setError(t("Image preview unavailable"))
      return () => abort.abort()
    }
    void pending
      .then((next) => {
        if (!abort.signal.aborted) {
          setResult(next)
        }
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t("Image preview unavailable"))
        }
      })
    return () => abort.abort()
  }, [api, path, worktreeId, projectId, before, after, scope, file.oldPath, revision, t])
  if (error) {
    return <EmptyState>{error}</EmptyState>
  }
  if (!result) {
    return <Loading>{t("Loading image comparison…")}</Loading>
  }
  return (
    <ImagePreview
      path={path}
      before={result.before}
      after={result.after}
      source={/\.svg$/i.test(path) ? <UnifiedDiff file={file} /> : undefined}
    />
  )
}
