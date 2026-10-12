import { useTranslation } from "react-i18next"
import { EmptyState } from "./feedback"
import { ImagePreview } from "./image-preview"
import "@/locales"
import { useMemo } from "react"
import { Diff, type FileData, Hunk, type HunkData, tokenize } from "react-diff-view"
import refractor from "refractor"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useWordWrap } from "@/lib/word-wrap"
import { FileIcon } from "./file-icon"

const languageOverrides: Record<string, string> = {
  cjs: "javascript",
  cts: "typescript",
  h: "c",
  hpp: "cpp",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  pyi: "python",
  pyw: "python",
  rs: "rust",
  sh: "bash",
  zsh: "bash",
}

function languageForPath(path: string) {
  const filename = path.split("/").at(-1)?.toLowerCase() ?? ""
  if (filename === "dockerfile" || filename.startsWith("dockerfile.")) {
    return "docker"
  }
  if (filename === "makefile" || filename === "gnumakefile") {
    return "makefile"
  }
  if (!filename.includes(".")) {
    return undefined
  }
  const extension = filename.split(".").at(-1) ?? ""
  const language = Object.hasOwn(languageOverrides, extension)
    ? languageOverrides[extension]
    : extension
  return refractor.registered(language) ? language : undefined
}

function countChanges(file: FileData) {
  return file.hunks.reduce(
    (totals, hunk) => {
      for (const change of hunk.changes) {
        if (change.type === "insert") {
          totals.additions += 1
        }
        if (change.type === "delete") {
          totals.deletions += 1
        }
      }
      return totals
    },
    { additions: 0, deletions: 0 },
  )
}

function sourceHunks(content: string): HunkData[] {
  if (!content) {
    return []
  }
  const lines = content.split("\n")
  if (lines.at(-1) === "") {
    lines.pop()
  }
  return [
    {
      content: "source",
      oldStart: 1,
      newStart: 1,
      oldLines: lines.length,
      newLines: lines.length,
      changes: lines.map((line, index) => ({
        type: "normal",
        isNormal: true,
        content: line,
        oldLineNumber: index + 1,
        newLineNumber: index + 1,
      })),
    },
  ]
}

export function UnifiedDiff(props: {
  file?: FileData
  source?: { path: string; content: string }
  textOnly?: boolean
}) {
  if (!props.textOnly && props.source && /\.svg$/i.test(props.source.path)) {
    return (
      <ImagePreview
        key={props.source.path}
        path={props.source.path}
        after={{
          dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.source.content)}`,
        }}
        source={<TextDiff {...props} />}
      />
    )
  }
  return <TextDiff {...props} />
}

function TextDiff({
  file,
  source,
}: {
  file?: FileData
  source?: { path: string; content: string }
}) {
  const { t } = useTranslation()
  const [wordWrap] = useWordWrap()

  let path = ""
  if (file) {
    path = file.type === "delete" ? file.oldPath : file.newPath || file.oldPath
  }
  path = source?.path ?? path
  const hunks = useMemo(
    () => (source ? sourceHunks(source.content) : (file?.hunks ?? [])),
    [source, file],
  )
  const language = languageForPath(path)
  const tokens = useMemo(() => {
    if (!language) {
      return undefined
    }
    return tokenize(hunks, { highlight: true, language, refractor })
  }, [hunks, language])

  if (!file && !source) {
    return <EmptyState>{t("No changed files")}</EmptyState>
  }

  const changes = file ? countChanges(file) : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileIcon path={path} />
          <code className="truncate text-code font-medium">{path}</code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {changes && !source && (
            <Badge variant="outline">
              <span className="text-diff-insert">+{changes.additions}</span>
              <span className="text-diff-delete">−{changes.deletions}</span>
            </Badge>
          )}
        </div>
      </div>
      {hunks.length ? (
        <div className="min-h-0 flex-1 overflow-auto bg-background">
          <Diff
            className={cn(source && "diff-source", wordWrap && "diff-wrap")}
            diffType={file?.type ?? "modify"}
            hunks={hunks}
            tokens={tokens}
            viewType="unified"
          >
            {(hunks) => hunks.map((hunk) => <Hunk hunk={hunk} key={hunk.content} />)}
          </Diff>
        </div>
      ) : (
        <EmptyState>
          {source
            ? t("Empty file")
            : t("No text hunks: binary content, an empty file, or a file mode change.")}
        </EmptyState>
      )}
    </div>
  )
}
