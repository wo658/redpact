import { problem } from "../core/problems.js"
import type { DirectoryDialog, DirectoryPicker } from "../core/types/directory-picker.js"

export function createDirectoryPicker(dialog: DirectoryDialog): DirectoryPicker {
  const shutdown = new AbortController()
  let pending: Promise<string | null> | undefined
  return {
    async pick(signal) {
      if (shutdown.signal.aborted) {
        problem("closing", "The server is shutting down")
      }
      if (pending) {
        problem("directory_picker_busy", "A folder selection window is already open")
      }
      const combined = signal ? AbortSignal.any([signal, shutdown.signal]) : shutdown.signal
      combined.throwIfAborted()
      pending = dialog.pick(combined)
      try {
        return await pending
      } finally {
        pending = undefined
      }
    },
    async close() {
      shutdown.abort()
      await pending?.catch(() => {})
    },
  }
}
