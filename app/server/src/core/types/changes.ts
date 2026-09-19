export type ChangeRoot = {
  path: string
  kind: "checkout" | "git" | "runtime" | "records" | "git-private" | "git-shared"
}
export type ChangeWatcher = {
  subscribe(
    roots: ChangeRoot[],
    changed: (paths?: string[]) => void,
    failed: () => void,
  ): {
    ready: Promise<void>
    close(): Promise<void>
  }
  close(): Promise<void>
}
