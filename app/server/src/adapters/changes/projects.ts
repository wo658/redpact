import { readFile } from "node:fs/promises"
import { dirname, relative } from "node:path"
import { instanceSettingsSchema } from "../../core/instance-schema.js"
import { projectExclusions } from "./exclusions.js"
import { FileWatch } from "./file-watch.js"

export async function observeProjectFiles(deps: {
  settingsPath: string
  defaults: string[]
  waitForInitial?: boolean
  observe(
    paths: string[],
    changed?: string[],
    signal?: AbortSignal,
  ): Promise<{ watchPaths: string[]; issues: { path: string; message: string }[] }>
  report(issues: { path: string; message: string }[]): void
}) {
  const watched = new Set<string>([deps.settingsPath])
  const ignored = (path: string) => {
    const runtime = relative(dirname(deps.settingsPath), path).split("/")[0]
    if (
      ["runs", "worktrees", "projects", "work-items", "submissions", "environments"].includes(
        runtime,
      )
    ) {
      return true
    }
    const root = [...watched]
      .sort((a, b) => b.length - a.length)
      .find((root) => path === root || path.startsWith(`${root}/`))
    if (!root) {
      return false
    }
    const parts = relative(root, path).split("/")
    if (
      root.endsWith("/.git") &&
      !["", "HEAD", "index", "refs", "packed-refs", "config", "worktrees"].includes(parts[0])
    ) {
      return true
    }
    return /(?:^|\/)(?:node_modules|dist|coverage|\.next|\.codex|\.pnpm-store|objects|logs)(?:\/|$)/.test(
      relative(root, path),
    )
  }
  const watcher = new FileWatch([deps.settingsPath], ignored, false, () => projectExclusions)
  const cancellation = new AbortController()
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let tail: Promise<void> = Promise.resolve()
  const pending = new Set<string>()
  async function refresh(changed?: string[]) {
    if (closed) {
      return
    }
    try {
      const source = await readFile(deps.settingsPath, "utf8")
      if (Buffer.byteLength(source) > 262144) {
        throw new Error("Instance settings exceed 256 KiB")
      }
      const settings = instanceSettingsSchema.parse(JSON.parse(source))
      const result = await deps.observe(
        [...new Set([...deps.defaults, ...(settings.projects ?? [])])],
        changed?.includes(deps.settingsPath) ? undefined : changed,
        cancellation.signal,
      )
      if (closed) {
        return
      }
      const next = new Set([deps.settingsPath, ...result.watchPaths])
      const previous = new Set(watched)
      watched.clear()
      for (const path of next) {
        watched.add(path)
      }
      for (const path of next) {
        if (!previous.has(path)) {
          watcher.add(path)
        }
      }
      for (const path of previous) {
        if (!next.has(path)) {
          await watcher.unwatch(path)
        }
      }
      deps.report(result.issues)
    } catch (error) {
      if (closed) {
        return
      }
      deps.report([
        {
          path: deps.settingsPath,
          message: error instanceof Error ? error.message : "Project observation failed",
        },
      ])
    }
  }
  const enqueue = (_event?: string, path?: string) => {
    if (path) {
      pending.add(path)
    }
    if (closed || timer) {
      return
    }
    timer = setTimeout(() => {
      tail = tail
        .then(async () => {
          const changed = [...pending]
          pending.clear()
          await refresh(changed)
        })
        .finally(() => {
          timer = undefined
          if (pending.size && !closed) {
            enqueue()
          }
        })
    }, 1000)
  }
  watcher.on("all", enqueue)
  watcher.on("error", (error) => deps.report([{ path: deps.settingsPath, message: String(error) }]))
  await new Promise<void>((resolve, reject) => {
    watcher.once("ready", resolve)
    watcher.once("failed", reject)
  })
  clearTimeout(timer)
  timer = undefined
  pending.clear()
  tail = tail.then(() => refresh())
  if (deps.waitForInitial !== false) {
    await tail
  }
  return {
    async close() {
      closed = true
      cancellation.abort()
      clearTimeout(timer)
      await watcher.close()
      await tail
    },
  }
}
