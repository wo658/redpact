import { relative } from "node:path"
import type { ChangeRoot, ChangeWatcher } from "../../core/types/changes.js"
import { changeExclusions } from "./exclusions.js"
import { FileWatch } from "./file-watch.js"

function ignored(root: ChangeRoot, path: string) {
  const parts = relative(root.path, path).split(/[\\/]/).filter(Boolean)
  if (!parts.length) {
    return false
  }
  if (parts[0] === "..") {
    return true
  }
  if (root.kind === "records") {
    return (
      parts.some((part) => part.startsWith(".")) ||
      (parts.length > 1 && parts.at(-1) !== "state.json")
    )
  }
  if (root.kind === "git-private") {
    return !["HEAD", "index", "config", "commondir"].includes(parts[0])
  }
  if ((root.kind === "git" || root.kind === "git-shared") && parts[0] === "logs") {
    return (parts.length > 1 && parts[1] !== "refs") || (parts.length > 2 && parts[2] !== "heads")
  }
  if (root.kind === "git-shared") {
    return !["refs", "packed-refs", "config"].includes(parts[0])
  }
  if (root.kind === "git") {
    return !["HEAD", "index", "refs", "packed-refs", "config", "commondir", "worktrees"].includes(
      parts[0],
    )
  }
  if (root.kind === "runtime") {
    return (
      ![
        "projects",
        "worktrees",
        "submissions",
        "runs",
        "environments",
        "previews",
        "worktree-selections",
      ].includes(parts[0]) ||
      (parts[0] === "runs" && parts.length > 2 && parts[2] !== "state.json")
    )
  }
  return (
    parts.some((part) =>
      [".git", "node_modules", ".codex", ".pnpm-store", "dist", ".next", "coverage"].includes(part),
    ) ||
    (parts[0] === ".redpact" && parts[1] === "runtime")
  )
}

export function createChangeWatcher(): ChangeWatcher {
  const shared = new Map<
    string,
    {
      watcher: FileWatch
      ready: Promise<void>
      listeners: Set<(event: string, path: string) => void>
      failures: Set<() => void>
    }
  >()
  const sessions = new Map<() => Promise<void>, () => void>()
  return {
    subscribe(roots, changed, failed) {
      if (sessions.size >= 32) {
        throw new Error("Too many live subscriptions")
      }
      let closed = false
      const fail = () => {
        if (!closed) {
          failed()
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const paths = new Set<string>()
      const notify = (_event: string, path: string) => {
        paths.add(path)
        if (closed || timer) {
          return
        }
        // Coalesce a write burst; idle subscriptions never read on a timer.
        timer = setTimeout(() => {
          timer = undefined
          if (!closed) {
            const changedPaths = [...paths]
            paths.clear()
            changed(changedPaths)
          }
        }, 100)
      }
      const keys = [...new Map(roots.map((root) => [`${root.kind}:${root.path}`, root])).entries()]
      const entries = keys.map(([key, root]) => {
        let entry = shared.get(key)
        if (!entry) {
          const listeners = new Set<typeof notify>()
          const failures = new Set<() => void>()
          const watcher = new FileWatch(
            [root.path],
            (path) => ignored(root, path),
            true,
            () => changeExclusions(root.kind),
          )
          const ready = new Promise<void>((resolve, reject) => {
            watcher.once("ready", resolve)
            watcher.on("all", (event, path) => {
              for (const listener of listeners) {
                listener(event, path)
              }
            })
            watcher.on("error", () => {})
            watcher.on("failed", (error) => {
              reject(error)
              for (const failure of failures) {
                failure()
              }
            })
          })
          entry = { watcher, ready, listeners, failures }
          shared.set(key, entry)
        }
        entry.listeners.add(notify)
        entry.failures.add(fail)
        return { key, entry }
      })
      const ready = Promise.all(entries.map(({ entry }) => entry.ready)).then(() => {})
      const close = async () => {
        if (closed) {
          return
        }
        closed = true
        clearTimeout(timer)
        sessions.delete(close)
        await Promise.all(
          entries.map(async ({ key, entry }) => {
            entry.listeners.delete(notify)
            entry.failures.delete(fail)
            if (!entry.listeners.size) {
              shared.delete(key)
              await entry.watcher.close()
            }
          }),
        )
      }
      sessions.set(close, failed)
      return { ready, close }
    },
    async close() {
      await Promise.all(
        [...sessions].map(([close, failed]) => {
          failed()
          return close()
        }),
      )
    },
  }
}
