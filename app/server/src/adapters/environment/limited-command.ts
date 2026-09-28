import { performance } from "node:perf_hooks"
import { PassThrough, Readable } from "node:stream"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"
import type { UnitCommandResult } from "../../core/types/unit-tests.js"
import { resourceEvidence, resourceMessage } from "../process/resource-evidence.js"
import { runtimeClient } from "./runtime.js"

// Callers verify ownership. Streaming exec is the bounded-output exception to ContainerClient.exec.
export async function executeLimitedContainer(
  id: string,
  args: string[],
  signal: AbortSignal,
  limits: TestResources,
): Promise<UnitCommandResult> {
  testResourceSchema.parse(limits)
  signal.throwIfAborted()
  const client = await runtimeClient()
  const container = client.container.getById(id)
  const docker = client.container.dockerode
  const support = await docker.info()
  if (!support.MemoryLimit || !support.SwapLimit) {
    throw new Error("Docker must support memory and swap limits before tests can run")
  }
  const bytes = limits.memoryMiB * 1024 * 1024
  await container.update({ Memory: bytes, MemorySwap: bytes })
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
  let commandStream: Readable | undefined
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
    commandStream?.destroy()
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
  const buffers = { stdout: [] as Buffer[], stderr: [] as Buffer[] }
  const sizes = { stdout: 0, stderr: 0 }
  const stdout = new PassThrough(),
    stderr = new PassThrough()
  for (const key of ["stdout", "stderr"] as const) {
    const stream = key === "stdout" ? stdout : stderr
    stream.on("data", (chunk: Buffer) => {
      const remaining = Math.max(0, 256 * 1024 - sizes[key])
      output.truncated ||= chunk.length > remaining
      if (remaining > 0) {
        buffers[key].push(chunk.subarray(0, remaining))
      }
      sizes[key] += Math.min(chunk.length, remaining)
    })
  }
  let exitCode: number | null = null
  try {
    if (!signal.aborted && !stopping) {
      const execution = await container.exec({ Cmd: args, AttachStdout: true, AttachStderr: true })
      const stream = await execution.start({ Detach: false, Tty: false })
      commandStream = stream
      try {
        docker.modem.demuxStream(stream, stdout, stderr)
        await new Promise<void>((resolve, reject) => {
          stream.once("end", resolve)
          stream.once("close", resolve)
          stream.once("error", reject)
          if (stopping) {
            stream.destroy()
          }
        })
        exitCode = (await execution.inspect()).ExitCode
      } finally {
        stream.destroy()
      }
    }
    // Historical events cover an OOM racing with exec completion.
    if (!error && !signal.aborted) {
      const history = await docker.getEvents({
        since: started,
        until: Date.now() / 1000,
        filters: { container: [id], event: ["oom"] },
      })
      for await (const _chunk of Readable.from(history)) {
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
    stdout.end()
    stderr.end()
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
    stdout: Buffer.concat(buffers.stdout).toString(),
    stderr: Buffer.concat(buffers.stderr).toString(),
    outcome,
    exitCode,
    error,
    ...(resourceLimit ? { resourceLimit } : {}),
  }
}
