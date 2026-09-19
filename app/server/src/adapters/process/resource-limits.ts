import { execFile } from "node:child_process"
import { performance } from "node:perf_hooks"
import { promisify } from "node:util"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"
import { resourceEvidence } from "./resource-evidence.js"

const exec = promisify(execFile)

// Detached test workers and their ordinary descendants share this process group.
export async function processGroupMemoryMiB(group: number): Promise<number> {
  if (process.platform === "win32") {
    throw new Error("Native test memory monitoring requires macOS or Linux")
  }
  const { stdout } = await exec("ps", ["-axo", "pgid=,rss="], {
    timeout: 2000,
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, LC_ALL: "C" },
  })
  let kib = 0
  for (const line of stdout.trim().split("\n")) {
    const [pgid, rss] = line.trim().split(/\s+/).map(Number)
    if (pgid === group && Number.isFinite(rss)) {
      kib += rss
    }
  }
  return kib / 1024
}

export function monitorProcessResources(
  group: number,
  limits: TestResources,
  terminate: (reason: string, evidence?: ResourceLimit) => void,
) {
  const started = performance.now()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = setTimeout(() => {
    if (!stopped) {
      terminate(
        `Time limit exceeded (${limits.timeoutSeconds} seconds)`,
        resourceEvidence(limits, started, "wall_clock", "process_group"),
      )
    }
  }, limits.timeoutSeconds * 1000)
  async function poll() {
    try {
      const memory = await processGroupMemoryMiB(group)
      if (!stopped && memory > limits.memoryMiB) {
        terminate(
          `Memory limit exceeded (${limits.memoryMiB} MiB; observed ${Math.ceil(memory)} MiB)`,
          resourceEvidence(limits, started, "process_rss", "process_group", memory),
        )
        return
      }
    } catch (error) {
      if (!stopped) {
        terminate(
          `Memory monitoring failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        return
      }
    }
    if (!stopped) {
      timer = setTimeout(() => void poll(), 100)
    }
  }
  void poll()
  return () => {
    stopped = true
    clearTimeout(deadline)
    clearTimeout(timer)
  }
}
