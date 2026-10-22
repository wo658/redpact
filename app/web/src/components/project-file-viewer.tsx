import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api } from "@/lib/api"
import { useTrackedFilesOnly } from "@/lib/tracked-files-only"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import type { ProjectEntry } from "../../../server/src/core/types/project-files"
import { FileList, type FileListEntry } from "./changed-file-list"
import { EmptyState, Loading, Notice } from "./feedback"
import { FileContent } from "./file-content"
import { FileIcon } from "./file-icon"
import { useLiveRevision } from "./live-updates"
import { ReviewToolbar } from "./review-toolbar"
import { Button } from "./ui/button"
import "@/locales"

function listEntries(directory: ProjectEntry): FileListEntry[] {
  if (directory.kind !== "directory") {
    return []
  }
  return directory.entries.map((entry) => ({
    path: directory.path ? `${directory.path}/${entry.name}` : entry.name,
    kind: entry.kind === "directory" ? "folder" : "file",
  }))
}

async function readExpandedFolders(
  api: Api,
  projectId: string,
  expandedPaths: string[],
  signal: AbortSignal,
  trackedOnly: boolean,
) {
  const entries = listEntries(await api.projectFile(projectId, "", signal, trackedOnly))
  const errors: string[] = []
  const paths = [...expandedPaths].sort((a, b) => a.split("/").length - b.split("/").length)
  // Load only expanded folders whose parents still list them.
  for (const path of paths) {
    if (signal.aborted) {
      break
    }
    if (!entries.some((entry) => entry.path === path && entry.kind === "folder")) {
      continue
    }
    try {
      entries.push(...listEntries(await api.projectFile(projectId, path, signal, trackedOnly)))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { entries, errors }
}

export function ProjectFileViewer({ api, projectId }: { api: Api; projectId: string }) {
  const [trackedOnly] = useTrackedFilesOnly()
  return (
    <FilteredProjectFiles
      key={`${projectId}:${trackedOnly}`}
      api={api}
      projectId={projectId}
      trackedOnly={trackedOnly}
    />
  )
}

function FilteredProjectFiles({
  api,
  projectId,
  trackedOnly,
}: {
  api: Api
  projectId: string
  trackedOnly: boolean
}) {
  const { t } = useTranslation()
  const revision = useLiveRevision()
  const [expandedPaths, setExpandedPaths] = useState<string[]>([])
  const [selected, setSelected] = useState("")
  const [entries, setEntries] = useState<FileListEntry[] | null>(null)
  const [preview, setPreview] = useState<ProjectEntry | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const read = useCallback(
    async (signal: AbortSignal) => {
      try {
        const { entries: next, errors } = await readExpandedFolders(
          api,
          projectId,
          expandedPaths,
          signal,
          trackedOnly,
        )
        let file: ProjectEntry | null = null
        const visibleSelection = next.some((entry) =>
          entry.kind === "folder"
            ? !expandedPaths.includes(entry.path) && selected.startsWith(`${entry.path}/`)
            : entry.path === selected,
        )
        if (selected && visibleSelection) {
          try {
            file = await api.projectFile(projectId, selected, signal, trackedOnly)
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }
        if (!signal.aborted) {
          if (!visibleSelection) {
            setSelected("")
          }
          setEntries(next)
          setPreview(file)
          setError(errors.join("\n"))
        }
      } catch (error) {
        if (!signal.aborted) {
          setError(error instanceof Error ? error.message : String(error))
          setPreview(null)
          setEntries(null)
          setSelected("")
        }
      }
    },
    [api, projectId, expandedPaths, selected, trackedOnly],
  )
  useRefreshRequest(read, revision, attempt)
  const displayedSelection = trackedOnly && error && !preview ? "" : selected
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ReviewToolbar
        navigation={<h1 className="text-sm font-medium">{t("File Viewer")}</h1>}
        actions={
          error ? (
            <Button variant="ghost" size="toolbar" onClick={() => setAttempt((value) => value + 1)}>
              {t("Retry")}
            </Button>
          ) : undefined
        }
      />
      {error && <Notice error>{error}</Notice>}
      <div
        style={{ containerType: "inline-size", containerName: "workspace" }}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <div className="review-layout project-files-layout h-full">
          <section
            className="review-list min-h-0 min-w-0 flex-col border-r"
            aria-label={t("Primary project files")}
          >
            {!entries && !error && <Loading>{t("Loading…")}</Loading>}
            {entries?.length === 0 && (
              <EmptyState>
                {t(trackedOnly ? "No Git-tracked files to display." : "Empty folder")}
              </EmptyState>
            )}
            {entries && (
              <FileList
                files={entries}
                selectedPath={displayedSelection}
                onSelect={(path) => {
                  if (path === selected) {
                    return
                  }
                  setSelected(path)
                  setPreview(null)
                  setError("")
                }}
                label={t("Project files")}
                mode="project"
                expandedPaths={expandedPaths}
                onExpandedPathsChange={setExpandedPaths}
              />
            )}
          </section>
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {displayedSelection && preview?.kind !== "text" && preview?.kind !== "image" && (
              <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
                <FileIcon path={displayedSelection} />
                <code className="truncate text-code font-medium" title={displayedSelection}>
                  {displayedSelection}
                </code>
              </div>
            )}
            {!displayedSelection && (
              <EmptyState className="flex-1">{t("Select a file to view its contents.")}</EmptyState>
            )}
            {displayedSelection && !preview && !error && <Loading>{t("Loading…")}</Loading>}
            {preview && <FileContent entry={preview} />}
          </section>
        </div>
      </div>
    </div>
  )
}
