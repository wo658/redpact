export type DirectoryDialog = {
  pick: (signal: AbortSignal) => Promise<string | null>
}
export type DirectoryPicker = {
  pick: (signal?: AbortSignal) => Promise<string | null>
  close: () => Promise<void>
}
