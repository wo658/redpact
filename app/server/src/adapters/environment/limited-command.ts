import { performance } from "node:perf_hooks"
import { execa } from "execa"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"
import { resourceEvidence, resourceMessage } from "../process/resource-evidence.js"
import { createProcessCommand } from "../test-runner/command.js"
import { minimalEnvironment } from "./testcontainers.js"

// Callers verify container ownership before entering this execution boundary.
export async function executeLimitedContainer(
  id: string,
  args: string[],
  signal: AbortSignal,
  limits: TestResources,
) {
  testResourceSchema.parse(limits)
  signal.throwIfAborted()
  const env = minimalEnvironment()
  const docker = (args: string[]) =>
    execa("docker", args, {
      env,
      extendEnv: false,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    })
  const support = await docker(["info", "--format", "{{.MemoryLimit}} {{.SwapLimit}}"])
  if (support.stdout.trim() !== "true true") {
    throw new Error("Docker must support memory and swap limits before tests can run")
  }
  const bytes = limits.memoryMiB * 1024 * 1024
  await docker(["update", "--memory", String(bytes), "--memory-swap", String(bytes), id])
  const inspection = JSON.parse((await docker(["inspect", id])).stdout)[0]
  if (inspection.HostConfig.Memory !== bytes || inspection.HostConfig.MemorySwap !== bytes) {
    throw new Error("Docker did not apply the requested memory limit")
  }
  signal.throwIfAborted()
  const abort = new AbortController()
  const started = String(Date.now() / 1000)
  const startedClock = performance.now()
  let resourceLimit: ResourceLimit | undefined
  const eventArgs = [
    "events",
    "--since",
    started,
    "--filter",
    `container=${id}`,
    "--filter",
    "event=oom",
    "--format",
    "{{.Action}}",
  ]
  let error: string | null = null
  let closing = false
  let stopping: Promise<void> | undefined
  function stop(reason?: string, source?: ResourceLimit["source"]) {
    if (abort.signal.aborted) {
      return
    }
    if (reason) {
      error ??= reason
    }
    if (source) {
      resourceLimit = resourceEvidence(limits, startedClock, source, "container")
    }
    abort.abort()
    stopping ??= docker(["kill", id]).then(
      () => {},
      async (cause) => {
        const inspected = await docker(["inspect", id]).catch(() => null)
        if (!inspected || JSON.parse(inspected.stdout)[0].State.Running) {
          error = `${error ?? "Execution stopped"}; container stop failed: ${cause.message}`
        }
      },
    )
  }
  const events = execa("docker", eventArgs, {
    env,
    extendEnv: false,
    buffer: false,
    reject: false,
    cancelSignal: abort.signal,
    forceKillAfterDelay: 500,
  })
  events.stdout?.on("data", () =>
    stop(`Memory limit exceeded (${limits.memoryMiB} MiB; Docker OOM)`, "docker_oom"),
  )
  const eventDone = events.then(() => {
    if (!closing && !abort.signal.aborted) {
      stop("Docker memory monitoring stopped unexpectedly")
    }
  })
  const deadline = setTimeout(
    () => stop(`Time limit exceeded (${limits.timeoutSeconds} seconds)`, "wall_clock"),
    limits.timeoutSeconds * 1000,
  )
  const cancel = () => stop()
  signal.addEventListener("abort", cancel, { once: true })
  if (signal.aborted) {
    cancel()
  }
  try {
    const result = await createProcessCommand().execute(
      process.cwd(),
      "docker",
      ["exec", id, ...args],
      AbortSignal.any([signal, abort.signal]),
      env,
      null,
    )
    // Query retained events too: an OOM can race with the exec client's exit.
    if (!error && !signal.aborted) {
      const history = await docker([...eventArgs, "--until", String(Date.now() / 1000)])
      if (history.stdout.trim()) {
        stop(`Memory limit exceeded (${limits.memoryMiB} MiB; Docker OOM)`, "docker_oom")
      }
    }
    await stopping
    if (resourceLimit) {
      const stopped = await docker(["inspect", id]).catch(() => null)
      resourceLimit.termination.confirmed =
        stopped !== null && JSON.parse(stopped.stdout)[0].State.Running === false
      resourceLimit.termination.exitCode = result.exitCode
      // docker exec's client exit status is not the container workload's signal.
      error = `${resourceMessage(resourceLimit)}; ${error}`
    }
    if (error) {
      return {
        ...result,
        outcome: "execution_error" as const,
        error,
        ...(resourceLimit ? { resourceLimit } : {}),
      }
    }
    return result
  } finally {
    closing = true
    clearTimeout(deadline)
    signal.removeEventListener("abort", cancel)
    abort.abort()
    await eventDone
    await stopping
  }
}
