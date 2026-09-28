import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import type { UnitCommand, UnitRun } from "../../core/types/unit-tests.js"
import { readProjectFile } from "../settings/bundle.js"
import { snapshotInputs } from "./inputs.js"
import { executeLimitedContainer } from "./limited-command.js"
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
    async execute(run, signal, observe) {
      try {
        signal.throwIfAborted()
        const limits = testResourceSchema.parse(await readLimits())
        const stage = source(run)
        await mkdir(stage, { recursive: true, mode: 0o700 })
        const inputDigest = await snapshotInputs(run.projectRoot, stage)
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
        const child = execa(process.execPath, [fileURLToPath(worker)], {
          cwd: stage,
          detached: true,
          ipc: true,
          env: { ...minimalEnvironment(), DOCKER_HOST: host },
          extendEnv: false,
          input: JSON.stringify({
            source: stage,
            dockerfile: run.settings.dockerfile,
            image: image(run),
            ownerId,
            id: run.id,
            limits,
          }),
          cancelSignal: signal,
          forceKillAfterDelay: 2000,
          timeout: 600000,
          reject: false,
          maxBuffer: 1024 * 1024,
        })
        let containerId: string
        try {
          const result = await child
          signal.throwIfAborted()
          if (result.exitCode !== 0) {
            throw new Error(`Unit container preparation failed: ${result.stderr.slice(-65536)}`)
          }
          containerId = JSON.parse(result.stdout).containerId
        } finally {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL")
            } catch {}
          }
        }
        const container = await owned(containerId, run)
        observe({ containerId, imageId: container.Image })
        signal.throwIfAborted()
        const cwd = run.settings.cwd === "." ? "/workspace" : `/workspace/${run.settings.cwd}`
        return await executeLimitedContainer(
          containerId,
          [
            "/bin/sh",
            "-c",
            'cd "$1" && exec /bin/sh -c "$2"',
            "redpact",
            cwd,
            run.settings.command,
          ],
          signal,
          limits,
        )
      } catch (error) {
        if (signal.aborted && error === signal.reason) {
          return {
            outcome: "cancelled",
            exitCode: null,
            stdout: "",
            stderr: "",
            truncated: false,
            error: null,
          }
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
        const containers = await containersWithLabels([
          `io.redpact.owner=${ownerId}`,
          `io.redpact.unit-run=${run.id}`,
        ])
        for (const container of containers) {
          await owned(container.Id, run)
          await removeContainer(container.Id)
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
