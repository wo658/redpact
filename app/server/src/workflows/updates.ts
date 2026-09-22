import { problem } from "../core/problems.js"
import type { UpdateStatus, Updates } from "../core/types/updates.js"
import { newerRelease } from "../core/updates.js"

export function createUpdates(options: {
  currentVersion: string
  supported: boolean
  readTags: (signal: AbortSignal) => Promise<Record<string, string>>
  requestInstall?: (version: string) => Promise<void>
  installError?: string
  now: () => string
}): Updates & { start(): void; close(): void; installationFailed(error: string): void } {
  let state: UpdateStatus = {
    currentVersion: options.currentVersion,
    supported: options.supported,
    canInstall: Boolean(options.requestInstall),
    installError: options.installError || null,
    version: null,
    busy: false,
    checkedAt: null,
    error: null,
  }
  let pending: Promise<UpdateStatus> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | undefined
  let closed = false
  let installing = false
  const status = () => ({ ...state })
  function check(): Promise<UpdateStatus> {
    if (installing) {
      return Promise.resolve(status())
    }
    if (pending) {
      return pending
    }
    if (closed || !options.supported) {
      state = { ...state, error: "npm updates are unavailable for this installation." }
      return Promise.resolve(status())
    }
    state = { ...state, busy: true, error: null }
    controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
    pending = Promise.resolve().then(async () => {
      try {
        const tags = await options.readTags(signal)
        state = {
          ...state,
          version: newerRelease(options.currentVersion, tags),
          checkedAt: options.now(),
        }
      } catch (error) {
        state = { ...state, error: error instanceof Error ? error.message : String(error) }
      } finally {
        state = { ...state, busy: false }
        pending = undefined
      }
      return status()
    })
    return pending
  }
  return {
    status,
    check,
    async install(version) {
      if (!options.requestInstall || !options.supported) {
        problem(
          "invalid_input",
          "Automatic installation is unavailable. Update using the package manager that owns this installation, then restart Redpact.",
        )
      }
      if (closed || pending || installing || version !== state.version) {
        problem("worktree_busy", "Update state changed. Check again before installing.")
      }
      installing = true
      state = { ...state, busy: true, installError: null }
      try {
        await options.requestInstall(version)
      } catch (error) {
        installing = false
        state = { ...state, busy: false }
        throw error
      }
      return { accepted: true }
    },
    installationFailed(error) {
      installing = false
      state = { ...state, busy: false, installError: error }
    },
    start() {
      if (timer || closed || !options.supported) {
        return
      }
      void check()
      timer = setInterval(() => void check(), 6 * 60 * 60 * 1000)
      timer.unref()
    },
    close() {
      closed = true
      clearInterval(timer)
      controller?.abort()
    },
  }
}
