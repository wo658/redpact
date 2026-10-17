import { performance } from "node:perf_hooks"
import { Readable } from "node:stream"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"
import type { UnitCommandResult } from "../../core/types/unit-tests.js"
import { resourceEvidence, resourceMessage } from "../process/resource-evidence.js"
import { runtimeClient } from "./runtime.js"

// Callers verify ownership; Testcontainers owns bounded transport and stream teardown.
export async function executeLimitedContainer(
  id: string,
  args: string[],
  signal: AbortSignal,
  limits: TestResources,
  observe?: (output: Pick<UnitCommandResult, "stdout" | "stderr" | "truncated">) => void,
): Promise<UnitCommandResult> {
  testResourceSchema.parse(limits)
  signal.throwIfAborted()
  const client = await runtimeClient()
  const container = client.container.getById(id)
  const support = await client.inspect()
  if (!support.memoryLimit || !support.swapLimit) {
    throw new Error("Docker must support memory and swap limits before tests can run")
  }
  const bytes = limits.memoryMiB * 1024 * 1024
  await client.container.update(container, { Memory: bytes, MemorySwap: bytes })
  const inspection = await client.container.inspect(container)
  if (inspection.HostConfig.Memory !== bytes || inspection.HostConfig.MemorySwap !== bytes) {
    throw new Error("Docker did not apply the requested memory limit")
  }
  signal.throwIfAborted()
  const started = Date.now() / 1000
  const startedClock = performance.now()
  let resourceLimit: ResourceLimit | undefined
  let error: string | null = null
  let closing = false
  let stopping: Promise<void> | undefined
  const commandAbort = new AbortController()
  function stop(reason?: string, source?: ResourceLimit["source"]) {
    if (stopping) {
      return
    }
    if (reason) {
      error ??= reason
    }
    if (source) {
      resourceLimit = resourceEvidence(limits, startedClock, source, "container")
    }
    commandAbort.abort()
    stopping = client.container.stop(container, { timeout: 0 }).catch(async () => {
      const observed = await client.container.inspect(container).catch(() => null)
      if (!observed || observed.State.Running) {
        error = `${error ?? "Execution stopped"}; container stop failed`
      }
    })
  }
  const events = await client.container.events(container, ["oom"])
  events.on("data", () =>
    stop(`Memory limit exceeded (${limits.memoryMiB} MiB; Docker OOM)`, "docker_oom"),
  )
  const monitorEnded = () => {
    if (!closing && !stopping) {
      stop("Docker memory monitoring stopped unexpectedly")
    }
  }
  events.on("error", monitorEnded)
  events.on("end", monitorEnded)
  const deadline = setTimeout(
    () => stop(`Time limit exceeded (${limits.timeoutSeconds} seconds)`, "wall_clock"),
    limits.timeoutSeconds * 1000,
  )
  const cancel = () => stop()
  signal.addEventListener("abort", cancel, { once: true })
  if (signal.aborted) {
    cancel()
  }
  const output = { stdout: "", stderr: "", truncated: false }
  let exitCode: number | null = null
  try {
    if (!signal.aborted && !stopping) {
      const result = await client.container.exec(container, args, {
        signal: commandAbort.signal,
        maxOutputBytes: 256 * 1024,
        onOutput: (captured) => {
          Object.assign(output, captured)
          observe?.(output)
        },
      })
      output.stdout = result.stdout
      output.stderr = result.stderr
      output.truncated = result.truncated ?? false
      exitCode = result.exitCode
    }
    // Historical events cover an OOM racing with exec completion.
    if (!error && !signal.aborted) {
      const history = await client.container.events(container, ["oom"], {
        since: started,
        until: Date.now() / 1000,
      })
      for await (const _chunk of Readable.from(history)) {
        stop(`Memory limit exceeded (${limits.memoryMiB} MiB; Docker OOM)`, "docker_oom")
      }
      const finalState = await client.container.inspect(container)
      if (finalState.State.OOMKilled) {
        stop(`Memory limit exceeded (${limits.memoryMiB} MiB; Docker OOM)`, "docker_oom")
      }
    }
  } catch {
    if (!signal.aborted && !error) {
      error = "Container command failed to execute"
    }
  } finally {
    closing = true
    clearTimeout(deadline)
    signal.removeEventListener("abort", cancel)
    events.destroy()
    await stopping
  }
  if (resourceLimit) {
    const observed = await client.container.inspect(container).catch(() => null)
    resourceLimit.termination.confirmed = observed !== null && !observed.State.Running
    resourceLimit.termination.exitCode = exitCode
    error = `${resourceMessage(resourceLimit)}; ${error}`
  }
  let outcome: UnitCommandResult["outcome"] = "command_failed"
  if (error) {
    outcome = "execution_error"
  } else if (signal.aborted) {
    outcome = "cancelled"
  } else if (exitCode === 0) {
    outcome = "command_succeeded"
  }
  return {
    ...output,
    outcome,
    exitCode,
    error,
    ...(resourceLimit ? { resourceLimit } : {}),
  }
}
