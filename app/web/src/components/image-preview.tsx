import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import type { GitImageSide } from "@/lib/api"
import { EmptyState, Notice } from "./feedback"
import { FileIcon } from "./file-icon"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"

export function isImagePath(path: string) {
  return /\.(png|jpe?g|svg|gif|webp|avif|bmp|ico)$/i.test(path)
}

function ImageSide({ side, label, path }: { side: GitImageSide; label: string; path: string }) {
  const { t } = useTranslation()
  const [failedUrl, setFailedUrl] = useState("")
  if (!side) {
    return <EmptyState>{t("Image absent in this revision")}</EmptyState>
  }
  if ("error" in side) {
    return <Notice>{side.error}</Notice>
  }
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2 p-3">
      {label && <figcaption className="text-sm font-medium">{label}</figcaption>}
      {failedUrl === side.dataUrl ? (
        <Notice>{t("This image could not be decoded.")}</Notice>
      ) : (
        <div className="image-diff-canvas flex min-h-48 flex-1 items-center justify-center overflow-auto rounded-md border p-4">
          <img
            src={side.dataUrl}
            alt={label ? `${label}: ${path}` : path}
            onError={() => setFailedUrl(side.dataUrl)}
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      )}
    </figure>
  )
}

export function ImagePreview({
  path,
  before,
  after,
  source,
}: {
  path: string
  before?: GitImageSide
  after: GitImageSide
  source?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="preview" className="min-h-0 min-w-0 flex-1 gap-0" data-file-preview="image">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileIcon path={path} />
          <code className="truncate text-code font-medium">{path}</code>
        </div>
        {source && (
          <TabsList variant="view" aria-label={t("File view")}>
            <TabsTrigger value="preview">{t("Preview")}</TabsTrigger>
            <TabsTrigger value="source">{t("Source")}</TabsTrigger>
          </TabsList>
        )}
      </div>
      <TabsContent value="preview" className="min-h-0 overflow-auto">
        <div className="image-diff-sides flex min-h-full min-w-0 flex-col">
          {before !== undefined && <ImageSide side={before} label={t("Before")} path={path} />}
          <ImageSide side={after} label={before === undefined ? "" : t("After")} path={path} />
        </div>
      </TabsContent>
      {source && (
        <TabsContent value="source" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {source}
        </TabsContent>
      )}
    </Tabs>
  )
}
