import { appendFileSync } from "node:fs"
import { join } from "node:path"

// Synchronous local diagnostics survive parent IPC loss and immediate process exit.
export function createLifecycleLog(directory: string) {
  return (event: string, fields: Record<string, unknown> = {}) => {
    try {
      appendFileSync(
        join(directory, "runtime-lifecycle.jsonl"),
        `${JSON.stringify({
          time: new Date().toISOString(),
          pid: process.pid,
          event,
          ...fields,
        })}\n`,
        { mode: 0o600 },
      )
    } catch (error) {
      process.emitWarning(
        new Error("Could not persist runtime lifecycle diagnostic", { cause: error }),
      )
    }
  }
}
