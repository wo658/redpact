import { EventEmitter } from "node:events"
import { ParcelProjectWatch } from "./parcel-project-watch.js"

// Both observation and UI subscriptions recover their actual filesystem handles.
export class FileWatch extends EventEmitter {
  private readonly paths: Set<string>
  private watcher?: ParcelProjectWatch
  private timer?: ReturnType<typeof setTimeout>
  private closing = Promise.resolve()
  private closed = false
  private attempts = 0
  private ready = false
  private startedAt = 0

  constructor(
    paths: string[],
    private readonly ignored: (path: string) => boolean,
    private readonly ignoreInitial = false,
    private readonly exclusions: (root: string) => RegExp[] = () => [],
  ) {
    super()
    this.paths = new Set(paths)
    queueMicrotask(() => this.start())
  }

  private start() {
    if (this.closed || !this.paths.size) {
      return
    }
    try {
      const paths = [...this.paths]
      const watcher = new ParcelProjectWatch(
        paths[0],
        this.ignored,
        this.ignoreInitial,
        this.exclusions,
      )
      this.startedAt = Date.now()
      this.watcher = watcher
      watcher.on("error", (error) => this.recover(error, watcher))
      watcher.on("all", (event, path) => {
        if (this.watcher === watcher && !this.closed) {
          this.emit("all", event, path)
        }
      })
      watcher.once("ready", () => {
        if (this.watcher !== watcher || this.closed) {
          return
        }
        const recovering = this.ready
        this.ready = true
        this.emit("ready")
        if (recovering) {
          for (const path of this.paths) {
            this.emit("all", "change", path)
          }
        }
      })
      for (const path of paths.slice(1)) {
        watcher.add(path)
      }
    } catch (error) {
      this.recover(error, this.watcher)
    }
  }

  private recover(error: unknown, watcher = this.watcher) {
    if (this.closed || this.timer || watcher !== this.watcher) {
      return
    }
    this.watcher = undefined
    this.closing = Promise.resolve()
      .then(() => watcher?.close())
      .catch((closeError: unknown) => {
        this.closed = true
        clearTimeout(this.timer)
        this.emit("error", closeError)
        this.emit("failed", closeError)
      })
    if (watcher && Date.now() - this.startedAt >= 30000) {
      this.attempts = 0
    }
    this.attempts++
    if (this.attempts > 5) {
      this.emit("error", error)
      this.emit("failed", error)
      return
    }
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        void this.closing.then(() => this.start())
      },
      Math.min(1000 * 2 ** (this.attempts - 1), 10000),
    )
    this.emit("error", error)
  }

  add(path: string) {
    this.paths.add(path)
    try {
      this.watcher?.add(path)
    } catch (error) {
      this.recover(error)
    }
  }

  async unwatch(path: string) {
    this.paths.delete(path)
    try {
      await this.watcher?.unwatch(path)
    } catch (error) {
      this.recover(error)
    }
  }

  async close() {
    this.closed = true
    clearTimeout(this.timer)
    await this.watcher?.close()
    this.watcher = undefined
    await this.closing
  }
}
