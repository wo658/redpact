import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ResourceLimit, TestResources } from "../../core/types/test-resources.js"
import type { UnitCommandResult, UnitRun } from "../../core/types/unit-tests.js"
import { resourceMessage } from "../process/resource-evidence.js"
import { monitorProcessResources } from "../process/resource-limits.js"

export function createProcessCommand() {
  return {
    async execute(
      cwd: string,
      file: string,
      args: string[],
      signal: AbortSignal,
      env: NodeJS.ProcessEnv = process.env,
      limits: TestResources | null = testResourceSchema.parse({}),
      outputLimit = 256 * 1024,
    ): Promise<UnitCommandResult> {
      const output = { stdout: "", stderr: "", truncated: false }
      if (signal.aborted) {
        return { ...output, outcome: "cancelled", exitCode: null, error: null }
      }
      if (limits) {
        testResourceSchema.parse(limits)
      }
      const child = spawn(file, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      })
      const buffers = { stdout: [] as Buffer[], stderr: [] as Buffer[] }
      const sizes = { stdout: 0, stderr: 0 }
      for (const stream of ["stdout", "stderr"] as const) {
        child[stream].on("data", (chunk: Buffer) => {
          const remaining = Math.max(0, outputLimit - sizes[stream])
          if (chunk.length > remaining) {
            output.truncated = true
          }
          if (remaining > 0) {
            buffers[stream].push(chunk.subarray(0, remaining))
          }
          sizes[stream] += Math.min(chunk.length, remaining)
        })
      }
      function kill(sig: NodeJS.Signals) {
        if (!child.pid) {
          return
        }
        try {
          if (process.platform === "win32") {
            child.kill(sig)
          } else {
            process.kill(-child.pid, sig)
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
            throw error
          }
        }
      }
      let resourceError: string | null = null
      let resourceLimit: ResourceLimit | undefined
      const stopMonitoring =
        child.pid && limits
          ? monitorProcessResources(child.pid, limits, (reason, evidence) => {
              if (resourceError) {
                return
              }
              resourceError = reason
              resourceLimit = evidence
              kill("SIGKILL")
            })
          : () => {}
      let cancellation: Promise<void> | undefined
      const abort = () => {
        stopMonitoring()
        cancellation ??= (async () => {
          kill("SIGTERM")
          await delay(500)
          kill("SIGKILL")
        })()
      }
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) {
        abort()
      }
      let spawnError: string | null = null
      child.on("error", (error) => {
        spawnError = error.message
      })
      const [exitCode, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>(
        (resolve) => child.once("close", (code, sig) => resolve([code, sig])),
      )
      stopMonitoring()
      kill("SIGKILL")
      await cancellation
      signal.removeEventListener("abort", abort)
      if (resourceLimit) {
        resourceLimit.termination = {
          target: "process_group",
          confirmed: false,
          exitCode,
          signal: exitSignal,
        }
        try {
          if (child.pid) {
            process.kill(-child.pid, 0)
          }
        } catch (error) {
          resourceLimit.termination.confirmed = (error as NodeJS.ErrnoException).code === "ESRCH"
        }
        resourceError = resourceMessage(resourceLimit)
      }
      let outcome: UnitRun["outcome"] = "command_failed"
      if (resourceError) {
        outcome = "execution_error"
      } else if (signal.aborted) {
        outcome = "cancelled"
      } else if (spawnError || exitSignal) {
        outcome = "execution_error"
      } else if (exitCode === 0) {
        outcome = "command_succeeded"
      }
      return {
        ...output,
        ...(resourceLimit ? { resourceLimit } : {}),
        stdout: Buffer.concat(buffers.stdout).toString("utf8"),
        stderr: Buffer.concat(buffers.stderr).toString("utf8"),
        outcome,
        exitCode,
        error:
          resourceError ??
          spawnError ??
          (exitSignal ? `Command terminated by ${exitSignal}` : null),
      }
    },
  }
}
