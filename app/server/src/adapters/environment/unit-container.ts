import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import type { UnitCommand, UnitRun } from "../../core/types/unit-tests.js"
import { unitExecutionCommand } from "../../core/unit-execution-command.js"
import { readProjectFile } from "../settings/bundle.js"
import { createDiagnosticTail } from "./diagnostics.js"
import { snapshotInputs } from "./inputs.js"
import { type RunnerSession, startRunner } from "./runner-session.js"
import {
  containersWithLabels,
  inspectContainer,
  inspectImage,
  removeContainer,
  removeImage,
  runtimeIdentity,
  runtimeSocket,
} from "./runtime.js"
import { minimalEnvironment } from "./testcontainers.js"

export function createUnitContainer(
  dataDir: string,
  ownerId: string,
  readLimits: ReadTestResources = async () => testResourceSchema.parse({}),
): UnitCommand {
  const sessions = new Map<string, RunnerSession>()
  const source = (run: UnitRun) => join(dataDir, "unit-sources", run.id)
  const image = (run: UnitRun) => `redpact-unit:${run.id}`
  async function runtime(run: UnitRun) {
    return runtimeIdentity(run.runtimeId)
  }

  async function owned(id: string, run: UnitRun) {
    const container = await inspectContainer(id)
    if (
      container.Config.Labels?.["io.redpact.owner"] !== ownerId ||
      container.Config.Labels?.["io.redpact.unit-run"] !== run.id
    ) {
      throw new Error("Unit container ownership mismatch")
    }
    return container
  }
  return {
    fingerprint: (root) => snapshotInputs(root),
    async execute(run, signal, observe) {
      const diagnostics = { stdout: createDiagnosticTail(), stderr: createDiagnosticTail() }
      let diagnosticBytes = 0
      const commandOutput = { stdout: "", stderr: "", truncated: false }
      try {
        signal.throwIfAborted()
        const limits = testResourceSchema.parse(await readLimits())
        const stage = source(run)
        await mkdir(stage, { recursive: true, mode: 0o700 })
        const inputDigest = await snapshotInputs(run.projectRoot, stage)
        if (run.inputDigest && inputDigest !== run.inputDigest) {
          throw new Error("Unit sources changed during review; request a new execution")
        }
        await readProjectFile(stage, run.settings.dockerfile)
        observe({ inputDigest })
        signal.throwIfAborted()
        const host = await runtimeSocket()
        const runtimeId = await runtime(run)
        observe({ runtimeId })
        signal.throwIfAborted()
        let worker = new URL("./unit-worker.js", import.meta.url)
        if (!existsSync(worker)) {
          worker = new URL("./unit-worker.ts", import.meta.url)
        }
        const session = await startRunner(
          worker,
          {
            source: stage,
            dockerfile: run.settings.dockerfile,
            image: image(run),
            ownerId,
            id: run.id,
            limits,
          },
          signal,
          {
            cwd: stage,
            environment: {
              ...minimalEnvironment(),
              DOCKER_HOST: host,
              DEBUG: "testcontainers:build,testcontainers:pull",
            },
            timeout: 600000,
            diagnostic: (chunk, stream) => {
              diagnostics[stream].write(chunk)
              diagnosticBytes += chunk.length
            },
            failure: (stderr) => `Unit container preparation failed: ${stderr}`,
          },
        )
        sessions.set(run.id, session)
        const containerId = session.containerId
        const container = await owned(containerId, run)
        observe({ containerId, imageId: container.Image })
        signal.throwIfAborted()
        return await session.execute(
          unitExecutionCommand(run.settings, run.executionSelection ?? undefined),
          limits,
          signal,
          (output) => Object.assign(commandOutput, output),
        )
      } catch (error) {
        if (!sessions.has(run.id)) {
          diagnostics.stdout.finish()
          diagnostics.stderr.finish()
        }
        const output = {
          stdout: commandOutput.stdout || diagnostics.stdout.read(),
          stderr: commandOutput.stderr || diagnostics.stderr.read(),
          truncated: commandOutput.truncated || diagnosticBytes >= 65536,
        }
        if (signal.aborted && error === signal.reason) {
          return {
            outcome: "cancelled",
            exitCode: null,
            ...output,
            error: null,
          }
        }
        if (error instanceof Error) {
          Object.assign(error, {
            ...output,
            stderr: output.stderr || error.message,
          })
        }
        throw error
      }
    },
    async stop(run) {
      if (run.runtimeId) {
        await runtime(run)
        if (run.containerId) {
          try {
            await owned(run.containerId, run)
          } catch (error) {
            if ((error as { statusCode?: number }).statusCode !== 404) {
              throw error
            }
          }
        }
        const session = sessions.get(run.id)
        if (session) {
          try {
            await session.stop()
          } finally {
            sessions.delete(run.id)
          }
        } else {
          // Recovery covers resources retained by older versions or a lost worker.
          const containers = await containersWithLabels([
            `io.redpact.owner=${ownerId}`,
            `io.redpact.unit-run=${run.id}`,
          ])
          for (const container of containers) {
            await owned(container.Id, run)
            await removeContainer(container.Id)
          }
        }
        const built = await inspectImage(image(run))
        if (built) {
          if (
            built.Config.Labels?.["io.redpact.owner"] !== ownerId ||
            built.Config.Labels?.["io.redpact.unit-run"] !== run.id ||
            (run.imageId && built.Id !== run.imageId)
          ) {
            throw new Error("Unit image ownership mismatch")
          }
          await removeImage(image(run))
        }
      }
      await rm(source(run), { recursive: true, force: true })
    },
  }
}
