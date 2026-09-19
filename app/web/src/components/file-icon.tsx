import { fileIconUrl, folderIconUrl } from "@/lib/file-icons"

function MaterialIcon({ normal, light }: { normal: string; light: string }) {
  if (normal === light) {
    return <img src={normal} alt="" className="size-4 shrink-0" />
  }
  return (
    <>
      <img src={light} alt="" className="size-4 shrink-0 dark:hidden" />
      <img src={normal} alt="" className="hidden size-4 shrink-0 dark:block" />
    </>
  )
}

export function FileIcon({ path }: { path: string }) {
  return <MaterialIcon normal={fileIconUrl(path)} light={fileIconUrl(path, true)} />
}

export function FolderIcon({ path, expanded }: { path: string; expanded: boolean }) {
  return (
    <MaterialIcon
      normal={folderIconUrl(path, expanded)}
      light={folderIconUrl(path, expanded, true)}
    />
  )
}
