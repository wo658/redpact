import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import type { TestResources } from "../../core/types/test-resources.js"
import type { UnitCommandResult } from "../../core/types/unit-tests.js"
import { createDiagnosticTail } from "./diagnostics.js"

export type RunnerOutput = Pick<UnitCommandResult, "stdout" | "stderr" | "truncated">

export interface RunnerSession {
  containerId: string
  execute(
    args: string[],
    limits: TestResources,
    signal: AbortSignal,
    observe?: (output: RunnerOutput) => void,
  ): Promise<UnitCommandResult>
  exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>
  copyOutput(target: string): Promise<void>
  stop(): Promise<void>
}

// The worker owns its Testcontainers handles until evidence has been collected and stop completes.
export async function startRunner(
  worker: URL,
  input: unknown,
  signal: AbortSignal,
  options: {
    timeout: number
    cwd?: string
    environment?: Record<string, string>
    redactions?: string[]
    failure: (stderr: string) => string
    diagnostic?: (chunk: Buffer, stream: "stdout" | "stderr") => void
  },
): Promise<RunnerSession> {
  signal.throwIfAborted()
  const child = spawn(
    process.execPath,
    [
      ...(worker.pathname.endsWith(".ts") ? ["--import", import.meta.resolve("tsx")] : []),
      fileURLToPath(worker),
    ],
    {
      cwd: options.cwd,
      env: { ...options.environment, TESTCONTAINERS_RYUK_ISOLATED: "true" },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    },
  )
  const diagnostics = {
    stdout: createDiagnosticTail(options.redactions),
    stderr: createDiagnosticTail(options.redactions),
  }
  let sequence = 0
  let ready = false
  let closed = false
  const pending = new Map<
    number,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      observe?: (output: RunnerOutput) => void
    }
  >()
  const failure = (fallback: string) => {
    const detail = diagnostics.stdout.read() + diagnostics.stderr.read()
    if (ready) {
      return new Error(`${fallback}${detail ? `: ${detail}` : ""}`)
    }
    return new Error(options.failure(detail || fallback))
  }
  const collect = (stream: "stdout" | "stderr", chunk: Buffer) => {
    diagnostics[stream].write(chunk)
    options.diagnostic?.(chunk, stream)
  }
  child.stderr?.on("data", (chunk: Buffer) => collect("stderr", chunk))
  child.stdout?.on("data", (chunk: Buffer) => collect("stdout", chunk))
  child.stdin?.on("error", () => {})
  let readyResolve: (id: string) => void
  let readyReject: (error: unknown) => void
  const prepared = new Promise<string>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const abortPreparation = () => {
    readyReject(signal.reason)
    child.kill("SIGKILL")
  }
  const deadline = setTimeout(() => {
    readyReject(failure("Runner preparation timed out"))
    child.kill("SIGKILL")
  }, options.timeout)
  signal.addEventListener("abort", abortPreparation, { once: true })
  child.on("message", (message) => {
    if (!message || typeof message !== "object") {
      return
    }
    const response = message as {
      ready?: boolean
      containerId?: string
      requestId?: number
      error?: string
      value?: unknown
      output?: RunnerOutput
    }
    if (response.ready && typeof response.containerId === "string" && response.containerId) {
      ready = true
      readyResolve(response.containerId)
    } else if (typeof response.requestId === "number") {
      const request = pending.get(response.requestId)
      if (response.output) {
        request?.observe?.(response.output)
        return
      }
      pending.delete(response.requestId)
      if (response.error) {
        request?.reject(new Error(response.error))
      } else {
        request?.resolve(response.value)
      }
    }
  })
  const exited = new Promise<void>((resolve) => {
    child.on("close", () => {
      closed = true
      diagnostics.stdout.finish()
      diagnostics.stderr.finish()
      if (!ready) {
        readyReject(failure("Runner preparation failed"))
      }
      for (const request of pending.values()) {
        request.reject(failure("Runner worker exited unexpectedly"))
      }
      pending.clear()
      resolve()
    })
  })
  child.on("error", (error) => readyReject(failure(error.message)))
  child.stdin?.end(JSON.stringify(input))
  let containerId: string
  try {
    containerId = await prepared
  } catch (error) {
    child.kill("SIGKILL")
    await exited
    throw error
  } finally {
    clearTimeout(deadline)
    signal.removeEventListener("abort", abortPreparation)
  }
  function request<T>(
    action: string,
    fields: Record<string, unknown> = {},
    observe?: (output: RunnerOutput) => void,
  ): Promise<T> {
    if (closed || !child.connected) {
      return Promise.reject(failure("Runner worker is unavailable"))
    }
    const requestId = ++sequence
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: (value) => resolve(value as T), reject, observe })
      child.send({ requestId, action, ...fields }, (error) => {
        if (error) {
          pending.delete(requestId)
          reject(failure(error.message))
        }
      })
    })
  }
  let stopped: Promise<void> | undefined
  return {
    containerId,
    async execute(args, limits, executionSignal, observe) {
      const cancel = () => {
        if (child.connected) {
          child.send({ action: "cancel" }, () => {})
        }
      }
      const result = request<UnitCommandResult>("execute", { args, limits }, observe)
      executionSignal.addEventListener("abort", cancel, { once: true })
      if (executionSignal.aborted) {
        cancel()
      }
      try {
        const output = await result
        observe?.(output)
        return output
      } finally {
        executionSignal.removeEventListener("abort", cancel)
      }
    },
    exec: (args) => request("exec", { args }),
    copyOutput: (target) => request("copy", { target }),
    stop() {
      stopped ??= (async () => {
        // A stuck cleanup must fail visibly and release the Ryuk session.
        const timeout = setTimeout(() => child.kill("SIGKILL"), 30000)
        try {
          await request("stop")
          await exited
        } finally {
          clearTimeout(timeout)
          if (!closed) {
            child.kill("SIGKILL")
          }
          await exited
        }
      })()
      return stopped
    },
  }
}
