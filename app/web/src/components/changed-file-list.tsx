import { useTranslation } from "react-i18next"
import "@/locales"
import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react"
import type { FileData } from "react-diff-view"
import { cn } from "@/lib/utils"
import { FileIcon, FolderIcon } from "./file-icon"

interface ChangedFileListProps {
  files: FileData[]
  onSelect: (path: string) => void
  selectedPath: string
}

interface FileTreeNode {
  annotation?: string
  additions: number
  children: string[]
  deletions: number
  fileType?: FileData["type"]
  id: string
  kind: "file" | "folder"
  name: string
  path?: string
}

const fileTypeLabels = {
  add: "A",
  copy: "C",
  delete: "D",
  modify: "M",
  rename: "R",
} as const

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

export type FileListMode = "project" | "worktree"

export interface FileListEntry {
  annotation?: string
  kind?: "file" | "folder"
  path: string
  type?: FileData["type"]
  additions?: number
  deletions?: number
}

function buildFileTree(files: FileListEntry[]) {
  const nodes = new Map<string, FileTreeNode>()
  const folderIds = ["root"]
  const rootNode: FileTreeNode = {
    additions: 0,
    children: [],
    deletions: 0,
    id: "root",
    kind: "folder",
    name: "root",
  }
  nodes.set("root", rootNode)

  for (const file of files) {
    const path = file.path
    const folder = file.kind === "folder"
    const parts = path.split("/")
    let parentId = "root"

    for (let index = 0; index < parts.length - (folder ? 0 : 1); index += 1) {
      const folderPath = parts.slice(0, index + 1).join("/")
      const folderId = `folder:${folderPath}`

      if (!nodes.has(folderId)) {
        nodes.set(folderId, {
          additions: 0,
          children: [],
          deletions: 0,
          id: folderId,
          kind: "folder",
          name: parts[index],
        })
        nodes.get(parentId)?.children.push(folderId)
        folderIds.push(folderId)
      }
      parentId = folderId
    }

    if (folder) {
      continue
    }
    const changes = { additions: file.additions ?? 0, deletions: file.deletions ?? 0 }
    const fileId = `file:${path}`
    nodes.set(fileId, {
      ...changes,
      children: [],
      fileType: file.type,
      annotation: file.annotation,
      id: fileId,
      kind: "file",
      name: parts.at(-1) ?? path,
      path,
    })
    nodes.get(parentId)?.children.push(fileId)
  }

  for (const node of nodes.values()) {
    node.children.sort((leftId, rightId) => {
      const left = nodes.get(leftId)
      const right = nodes.get(rightId)
      if (!left || !right) {
        return 0
      }
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
  }

  return { folderIds, nodes, rootNode }
}

export function ChangedFileList({ files, onSelect, selectedPath }: ChangedFileListProps) {
  const entries = useMemo(
    () =>
      files.map((file) => ({
        path: file.newPath || file.oldPath,
        type: file.type,
        ...countChanges(file),
      })),
    [files],
  )
  const { t } = useTranslation()
  return (
    <FileList
      mode="worktree"
      files={entries}
      onSelect={onSelect}
      selectedPath={selectedPath}
      label={t("Changed files")}
    />
  )
}

export function FileList({
  files,
  onSelect,
  selectedPath,
  label,
  mode,
  expandedPaths,
  onExpandedPathsChange,
}: {
  files: FileListEntry[]
  onSelect: (path: string) => void
  selectedPath: string
  label: string
  mode: FileListMode
  expandedPaths?: string[]
  onExpandedPathsChange?: Dispatch<SetStateAction<string[]>>
}) {
  const { t } = useTranslation()
  const { folderIds, nodes, rootNode } = useMemo(() => buildFileTree(files), [files])
  const totals = files.reduce(
    (result, file) => ({
      additions: result.additions + (file.additions ?? 0),
      deletions: result.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  )
  const expandedItems = useMemo(
    () => expandedPaths?.map((path) => `folder:${path}`),
    [expandedPaths],
  )
  const tree = useTree<FileTreeNode>({
    dataLoader: {
      getChildren: (itemId) => nodes.get(itemId)?.children ?? [],
      getItem: (itemId) => nodes.get(itemId) ?? rootNode,
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
    getItemName: (item) => item.getItemData().name,
    initialState: {
      expandedItems: folderIds,
      selectedItems: selectedPath ? [`file:${selectedPath}`] : [],
    },
    state: {
      selectedItems: selectedPath ? [`file:${selectedPath}`] : [],
      ...(expandedItems ? { expandedItems } : {}),
    },
    ...(onExpandedPathsChange
      ? {
          setExpandedItems: (update: SetStateAction<string[]>) =>
            onExpandedPathsChange((previous) => {
              const ids = previous.map((path) => `folder:${path}`)
              const next = typeof update === "function" ? update(ids) : update
              return next.map((id) => id.slice("folder:".length))
            }),
        }
      : {}),
    isItemFolder: (item) => item.getItemData().kind === "folder",
    onPrimaryAction: (item) => {
      const path = item.getItemData().path
      if (path) {
        onSelect(path)
      }
    },
    rootItemId: "root",
  })

  useEffect(() => {
    void nodes
    tree.rebuildTree()
  }, [nodes, tree])

  return (
    <div className="min-h-0 flex-1 overflow-auto py-2">
      {mode === "worktree" && (
        <div className="flex h-7 items-center gap-2 px-3 text-[10px] text-muted-foreground">
          <span>
            {t("fileCount", { count: files.filter((file) => file.kind !== "folder").length })}
          </span>
          <span className="text-diff-insert">+{totals.additions}</span>
          <span className="text-diff-delete">−{totals.deletions}</span>
        </div>
      )}
      <div {...tree.getContainerProps(label)} className="px-1.5">
        {tree.getItems().map((item) => {
          const data = item.getItemData()
          const folder = data.kind === "folder"
          const selected = data.path === selectedPath
          const expanded = folder && item.isExpanded()
          const ChevronIcon = expanded ? ChevronDown : ChevronRight

          return (
            <button
              {...item.getProps()}
              className={cn(
                "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
              key={item.getId()}
              style={{ paddingLeft: `${item.getItemMeta().level * 14 + 6}px` }}
              type="button"
            >
              <span className="flex size-3 shrink-0 items-center justify-center text-muted-foreground">
                {folder && <ChevronIcon className="size-3" />}
              </span>
              {folder ? (
                <FolderIcon path={data.name} expanded={expanded} />
              ) : (
                <FileIcon path={data.path ?? data.name} />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                {data.name}
              </span>
              {!folder && data.annotation && (
                <span className="shrink-0 text-xs text-muted-foreground">{data.annotation}</span>
              )}
              {!folder && mode === "worktree" && data.fileType ? (
                <>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    <span className="text-diff-insert">+{data.additions}</span>{" "}
                    <span className="text-diff-delete">−{data.deletions}</span>
                  </span>
                  <span className="w-3 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
                    {fileTypeLabels[data.fileType]}
                  </span>
                </>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
