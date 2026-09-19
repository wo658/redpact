import type { ReactNode } from "react"
import { FileList, type FileListMode } from "./changed-file-list"

export function TestFileBrowser({
  files,
  mode = "worktree",
  path,
  onSelect,
  label,
  children,
}: {
  mode?: FileListMode
  files: { path: string }[]
  path: string
  onSelect: (path: string) => void
  label: string
  children: ReactNode
}) {
  if (!files.length) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</section>
    )
  }
  return (
    <div
      className="content-width-wide min-h-0 flex-1 overflow-hidden"
      style={{ containerType: "inline-size", containerName: "workspace" }}
    >
      <div className="review-layout h-full">
        <div className="review-list min-h-0 min-w-0 border-r">
          <FileList
            key={files.map((file) => file.path).join("|")}
            mode={mode}
            label={label}
            files={files}
            selectedPath={path}
            onSelect={onSelect}
          />
        </div>
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</section>
      </div>
    </div>
  )
}
