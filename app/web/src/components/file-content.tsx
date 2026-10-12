import { useTranslation } from "react-i18next"
import type { ProjectEntry } from "../../../server/src/core/types/project-files"
import { EmptyState } from "./feedback"
import { ImagePreview, isImagePath } from "./image-preview"
import { UnifiedDiff } from "./unified-diff"

export function FileContent({ entry }: { entry: ProjectEntry }) {
  const { t } = useTranslation()
  if (entry.kind === "image") {
    return (
      <ImagePreview
        key={entry.path}
        path={entry.path}
        after={{ dataUrl: entry.dataUrl }}
        source={
          entry.content !== undefined ? (
            <UnifiedDiff source={{ path: entry.path, content: entry.content }} textOnly />
          ) : undefined
        }
      />
    )
  }
  if (entry.kind === "text") {
    return <UnifiedDiff source={entry} />
  }
  if (entry.kind === "binary") {
    return <EmptyState>{t("Binary or non-UTF-8 file. Preview unavailable.")}</EmptyState>
  }
  if (entry.kind === "too_large") {
    return (
      <EmptyState>
        {isImagePath(entry.path)
          ? t("This image exceeds the 5 MiB preview limit.")
          : t("This file exceeds the 1 MiB preview limit.")}
      </EmptyState>
    )
  }
  return <EmptyState>{t("Select a file to view its contents.")}</EmptyState>
}
