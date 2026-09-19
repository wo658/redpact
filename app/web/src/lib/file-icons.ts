import manifest from "virtual:material-icons"

function lookup(map: Record<string, string> | undefined, key: string) {
  return map && Object.hasOwn(map, key) ? map[key] : undefined
}

function fileId(path: string, light: boolean) {
  const name = path.replaceAll("\\", "/").toLowerCase().split("/").at(-1) ?? ""
  const variant = light ? manifest.light : undefined
  const named = lookup(variant?.fileNames, name) ?? lookup(manifest.fileNames, name)
  if (named) {
    return named
  }
  // Prefer compound extensions (d.ts, test.tsx) over their final suffix.
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    const extension = name.slice(dot + 1)
    const id =
      lookup(variant?.fileExtensions, extension) ?? lookup(manifest.fileExtensions, extension)
    if (id) {
      return id
    }
  }
  return variant?.file ?? manifest.file
}

function folderId(path: string, expanded: boolean, light: boolean) {
  const name = path.replaceAll("\\", "/").toLowerCase().split("/").filter(Boolean).at(-1) ?? ""
  const variant = light ? manifest.light : undefined
  if (expanded) {
    return (
      lookup(variant?.folderNamesExpanded, name) ??
      lookup(manifest.folderNamesExpanded, name) ??
      variant?.folderExpanded ??
      manifest.folderExpanded
    )
  }
  return (
    lookup(variant?.folderNames, name) ??
    lookup(manifest.folderNames, name) ??
    variant?.folder ??
    manifest.folder
  )
}

export function fileIconUrl(path: string, light = false) {
  return iconUrl(fileId(path, light))
}

export function folderIconUrl(path: string, expanded: boolean, light = false) {
  return iconUrl(folderId(path, expanded, light))
}

function iconUrl(id: string | undefined) {
  const definition = id && manifest.iconDefinitions?.[id]
  const iconPath = definition ? definition.iconPath : undefined
  return `${import.meta.env.BASE_URL}${iconPath ?? "material-icons/file.svg"}`
}
