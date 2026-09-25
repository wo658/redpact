import { fileURLToPath } from "node:url"
import { execa } from "execa"

export async function prepareRunner(
  worker: URL,
  input: unknown,
  signal: AbortSignal,
  options: {
    timeout: number
    cwd?: string
    environment?: Record<string, string>
    failure: (stderr: string) => string
  },
): Promise<string> {
  signal.throwIfAborted()
  const child = execa(process.execPath, [fileURLToPath(worker)], {
    cwd: options.cwd,
    env: options.environment,
    extendEnv: false,
    detached: process.platform !== "win32",
    input: JSON.stringify(input),
    cancelSignal: signal,
    forceKillAfterDelay: 2000,
    timeout: options.timeout,
    reject: false,
    maxBuffer: 1024 * 1024,
  })
  try {
    const result = await child
    signal.throwIfAborted()
    if (result.failed) {
      // Never expose Execa's command/input diagnostics, which may contain secrets.
      const diagnostic =
        result.stderr.slice(-65536) ||
        (result.timedOut ? "Runner preparation timed out" : "Runner preparation failed")
      throw new Error(options.failure(diagnostic))
    }
    return containerIdentity(result.stdout)
  } finally {
    // Preparation can spawn a CLI; stop descendants before returning to cleanup.
    if (child.pid && process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {}
    }
  }
}

function containerIdentity(source: string): string {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error("Invalid runner container identity")
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("containerId" in value) ||
    typeof value.containerId !== "string" ||
    value.containerId.trim().length === 0
  ) {
    throw new Error("Invalid runner container identity")
  }
  return value.containerId
}
