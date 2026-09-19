import { EventEmitter } from "node:events"
import { type FSWatcher, lstatSync, realpathSync, watch } from "node:fs"
import { dirname, isAbsolute, join, relative, sep } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { type AsyncSubscription, type Event, subscribe } from "@parcel/watcher"

export function contains(root: string, path: string) {
  const part = relative(root, path)
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)
}
function directoryIdentity(path: string) {
  try {
    const stats = lstatSync(path)
    return stats.isDirectory() && !stats.isSymbolicLink() ? `${stats.dev}:${stats.ino}` : undefined
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      throw error
    }
    return undefined
  }
}
function linked(path: string, root: string) {
  for (let current = path; contains(root, current); current = dirname(current)) {
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return true
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw error
      }
    }
    if (current === root) {
      break
    }
  }
  return false
}

// Parcel owns recursive watching; shallow sentinels cover file targets and root replacement.
export class ParcelProjectWatch extends EventEmitter {
  private readonly roots = new Set<string>()
  private readonly subscriptions = new Map<
    string,
    { handle: AsyncSubscription; identity: string }
  >()
  private readonly parents = new Map<string, { handle: FSWatcher; identity: string }>()
  private tail = Promise.resolve()
  private closed = false
  private initialized = false

  constructor(
    path: string,
    private readonly ignored: (path: string) => boolean,
    private readonly ignoreInitial = false,
    private readonly exclusions: (root: string) => RegExp[] = () => [],
  ) {
    super()
    this.roots.add(path)
    queueMicrotask(() => {
      void this.schedule().then(() => {
        if (!this.closed) {
          this.initialized = true
          this.emit("ready")
          if (!this.ignoreInitial) {
            this.emit("all", "add", path)
          }
        }
      })
    })
  }

  private schedule() {
    this.tail = this.tail
      .then(() => this.reconcile())
      .catch((error: unknown) => {
        if (!this.closed) {
          this.emit("error", error)
        }
      })
    return this.tail
  }

  private async reconcile() {
    if (this.closed) {
      return
    }
    const recursive = [...this.roots]
      .filter((root) => directoryIdentity(root))
      .sort((a, b) => a.length - b.length)
      .filter(
        (root, index, roots) =>
          !roots
            .slice(0, index)
            .some(
              (other) =>
                contains(other, root) &&
                !this.exclusions(other).some((pattern) =>
                  pattern.test(relative(other, root).split(sep).join("/")),
                ),
            ),
      )
    const parents = new Set<string>()
    for (const root of this.roots) {
      let parent = dirname(root)
      while (!directoryIdentity(parent) && dirname(parent) !== parent) {
        parent = dirname(parent)
      }
      parents.add(parent)
    }
    // Arm parents before subscribing, so deletion during an asynchronous native start is observable.
    for (const [path, entry] of this.parents) {
      if (!parents.has(path) || directoryIdentity(path) !== entry.identity) {
        entry.handle.close()
        this.parents.delete(path)
      }
    }
    for (const path of parents) {
      if (this.parents.has(path)) {
        continue
      }
      const identity = directoryIdentity(path)
      if (!identity) {
        continue
      }
      const handle = watch(path, { recursive: false }, (event, filename) => {
        this.changed(filename ? join(path, filename) : path, event)
      })
      handle.on("error", (error) => this.emit("error", error))
      this.parents.set(path, { handle, identity })
    }
    for (const [path, entry] of this.subscriptions) {
      if (!recursive.includes(path) || directoryIdentity(path) !== entry.identity) {
        await entry.handle.unsubscribe()
        this.subscriptions.delete(path)
      }
    }
    for (const path of recursive) {
      if (this.closed || this.subscriptions.has(path)) {
        continue
      }
      const identity = directoryIdentity(path)
      if (!identity) {
        continue
      }
      const canonical = realpathSync(path)
      let armed = this.initialized
      const handle = await subscribe(
        path,
        (error, events) =>
          this.receive(
            error,
            (armed ? events : []).map((event) => ({
              ...event,
              path: contains(canonical, event.path)
                ? join(path, relative(canonical, event.path))
                : event.path,
            })),
          ),
        { ignore: this.exclusions(path) },
      )
      if (this.closed) {
        await handle.unsubscribe()
        return
      }
      this.subscriptions.set(path, { handle, identity })
      // Only initial startup can discard discovery events: after ready, edits during
      // root restoration or subscription replacement must remain observable.
      if (!armed) {
        await delay(100)
        armed = true
      }
    }
  }

  private receive(error: Error | null, events: Event[]) {
    if (this.closed) {
      return
    }
    if (error) {
      this.emit("error", error)
      return
    }
    try {
      for (const event of events) {
        this.changed(event.path, event.type)
      }
    } catch (error) {
      this.emit("error", error)
    }
  }

  private changed(path: string, event: string) {
    if (this.closed) {
      return
    }
    const invalidated = new Set<string>()
    for (const root of this.roots) {
      if (contains(path, root)) {
        const identity = directoryIdentity(root)
        if (identity && this.subscriptions.get(root)?.identity === identity) {
          continue
        }
        invalidated.add(root)
      } else if (contains(root, path) && !this.ignored(path) && !linked(path, root)) {
        this.emit("all", event, path)
      }
    }
    if (invalidated.size) {
      void this.schedule().then(() => {
        if (!this.closed) {
          for (const root of invalidated) {
            if (this.roots.has(root)) {
              this.emit("all", event, root)
            }
          }
        }
      })
    }
  }

  add(path: string) {
    if (this.closed || this.roots.has(path)) {
      return
    }
    this.roots.add(path)
    void this.schedule().then(() => {
      if (!this.closed && this.roots.has(path) && !this.ignoreInitial) {
        this.emit("all", "add", path)
      }
    })
  }
  async unwatch(path: string) {
    this.roots.delete(path)
    await this.schedule()
  }
  async close() {
    this.closed = true
    await this.tail
    for (const entry of this.parents.values()) {
      entry.handle.close()
    }
    this.parents.clear()
    await Promise.all([...this.subscriptions.values()].map((entry) => entry.handle.unsubscribe()))
    this.subscriptions.clear()
    this.roots.clear()
  }
}
