import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { captureCaseSchema } from "../../core/playwright-schema.js"
import {
  environmentRedactions,
  runnerConnections,
  runnerServiceHost,
} from "../../core/runner-environment.js"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { CaptureRun, CaptureRunner } from "../../core/types/playwright.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import { createDiagnosticLog } from "../environment/diagnostics.js"
import { snapshotInputs } from "../environment/inputs.js"
import { collectRunnerOutput } from "../environment/runner-output.js"
import { type RunnerSession, startRunner } from "../environment/runner-session.js"
import {
  containersWithLabels,
  inspectContainer,
  removeContainer,
  runnerNetwork,
  runtimeIdentity,
  runtimeSocket,
} from "../environment/runtime.js"
import { minimalEnvironment } from "../environment/testcontainers.js"

import { cleanupPlaywrightWorktree } from "./worktree.js"

const reportSchema = z.strictObject({
  outcome: z.enum(["passed", "failed", "timedout", "interrupted"]),
  cases: z.array(captureCaseSchema).max(1000),
  errors: z.array(z.string()).max(100),
})
export function createCaptureRunner(
  directory: string,
  ownerId: string,
  readLimits: ReadTestResources = async () => testResourceSchema.parse({}),
): CaptureRunner {
  const sessions = new Map<string, RunnerSession>()
  const inputs = (id: string) => join(directory, "playwright-inputs", id)
  const output = (id: string, side: string) => join(directory, "playwright-runs", id, side)
  async function verifyRuntime(runtimeId?: string) {
    return runtimeIdentity(runtimeId)
  }

  async function owned(id: string, run: CaptureRun, side: string) {
    const v = await inspectContainer(id)
    if (
      v.Config.Labels?.["io.redpact.owner"] !== ownerId ||
      v.Config.Labels?.["io.redpact.capture"] !== run.id ||
      v.Config.Labels?.["io.redpact.capture-side"] !== side
    ) {
      throw new Error("Capture container ownership mismatch")
    }
    return v
  }
  return {
    cleanupWorktree: (run) => cleanupPlaywrightWorktree(directory, run),
    async captureSources(id, root, settings) {
      const path = join(root, settings.directory),
        canonical = await realpath(root)
      if (
        (await lstat(path)).isSymbolicLink() ||
        relative(canonical, await realpath(path)).startsWith("..")
      ) {
        throw new Error("Scenario directory must remain within the project")
      }
      const stage = join(inputs(id), "tests")
      await mkdir(stage, { recursive: true, mode: 0o700 })
      try {
        const digest = await snapshotInputs(path, stage)
        const saved = join(directory, "playwright-runs", id, "sources")
        await mkdir(dirname(saved), { recursive: true, mode: 0o700 })
        await cp(stage, saved, { recursive: true, errorOnExist: true, force: false })
        return digest
      } catch (e) {
        await rm(inputs(id), { recursive: true, force: true })
        throw e
      }
    },
    async execute(run, side, environment, signal, observe) {
      const limits = testResourceSchema.parse(await readLimits())
      const redactions = environmentRedactions(environment)
      const redact = (text: string) =>
        redactions.reduce((result, value) => result.split(value).join("[REDACTED]"), text)
      signal.throwIfAborted()
      if (
        !/^[a-z][a-z0-9-]{0,63}$/.test(run.target) ||
        run.settings.targets[run.target]?.purpose !== run.purpose
      ) {
        throw new Error("Invalid Playwright target identity")
      }
      const runtimeId = await verifyRuntime(environment.runtimeId)
      const target = environment.resources.find(
        (r) => r.kind === "container" && r.service === run.settings.service,
      )
      if (!target) {
        throw new Error("Selected application container is unavailable")
      }
      const container = await inspectContainer(target.id)
      if (
        container.Config.Labels?.["io.redpact.owner"] !== ownerId ||
        container.Config.Labels?.["io.redpact.environment"] !== environment.id
      ) {
        throw new Error("Application container ownership mismatch")
      }
      const config = {
        testDir: "/review/tests",
        projects: Object.entries(run.settings.targets).map(([name, target]) => ({
          name,
          testMatch: target.testMatch.map((pattern) => `/review/tests/${pattern}`),
        })),
        outputDir: "/review/results",
        workers: 1,
        retries: 0,
        timeout: run.settings.timeoutMs,
        globalTimeout: limits.timeoutSeconds * 1000,
        reporter: [["/review/reporter.mjs"]],
        use: {
          browserName: "chromium",
          baseURL: `${run.settings.scheme}://${runnerServiceHost(run.settings.service)}:${run.settings.port}`,
          viewport: run.settings.viewport,
          deviceScaleFactor: 1,
          locale: run.settings.locale,
          timezoneId: run.settings.timezoneId,
          colorScheme: run.settings.colorScheme,
          reducedMotion: "reduce",
          screenshot: "only-on-failure",
          trace: redactions.length ? "off" : "on",
          video: run.settings.video ? { mode: "on", size: run.settings.viewport } : "off",
        },
      }
      let configurationSource = `module.exports=${JSON.stringify(config)}`
      if (run.executionSelection) {
        const patterns = run.executionSelection.files.map((path) => {
          const relative = path.slice(run.settings.directory.length + 1)
          const absolute = `/review/tests/${relative}`
          return `^${absolute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
        })
        configurationSource += `;module.exports.projects=module.exports.projects.map(p=>p.name===${JSON.stringify(run.target)}?{...p,testMatch:${JSON.stringify(patterns)}.map(s=>new RegExp(s))}:p)`
      }
      observe({ runtimeId, platform: "linux", state: "running" })
      let worker = new URL("./worker.js", import.meta.url)
      if (!existsSync(worker)) {
        worker = new URL("./worker.ts", import.meta.url)
      }
      const stderrLog = createDiagnosticLog(join(output(run.id, side), "stderr.log"), redactions)
      const stdoutLog = createDiagnosticLog(join(output(run.id, side), "stdout.log"), redactions)
      const captured = { stdout: "", stderr: "", truncated: false }
      let executionFailure: Error | undefined
      let result: Awaited<ReturnType<CaptureRunner["execute"]>> | undefined
      const describeFailure = (error: unknown) => {
        let message = redact(error instanceof Error ? error.message : String(error)).slice(-16384)
        for (const name of ["stderr", "stdout"] as const) {
          const excerpt = redact(captured[name]).slice(-16384)
          if (excerpt && !message.includes(excerpt)) {
            message += `\n${name}:\n${excerpt}`
          }
        }
        return new Error(message)
      }
      try {
        const session = await startRunner(
          worker,
          {
            assets: dirname(fileURLToPath(import.meta.url)),
            tests: join(inputs(run.id), "tests"),
            config: configurationSource,
            ownerId,
            id: run.id,
            side,
            network: await runnerNetwork(environment.projectName, ownerId, environment.id),
            environment: {
              ...environment.settings.tests.env,
              REDPACT_CONNECTIONS_FILE: "/review/connections.json",
            },
            connections: runnerConnections(environment),
            redactions,
            uiLanguage: run.settings.uiLanguage,
            limits,
          },
          signal,
          {
            timeout: 900000,
            redactions,
            environment: {
              ...minimalEnvironment(),
              DOCKER_HOST: await runtimeSocket(),
              DEBUG: "testcontainers:build,testcontainers:pull",
            },
            diagnostic: (chunk, stream) =>
              (stream === "stderr" ? stderrLog : stdoutLog).write(chunk),
            failure: (stderr) => `Playwright preparation failed: ${redact(stderr)}`,
          },
        )
        const stop = session.stop.bind(session)
        session.stop = async () => {
          try {
            await stop()
          } finally {
            await Promise.all([stdoutLog.finish(), stderrLog.finish()])
          }
        }
        sessions.set(`${run.id}:${side}`, session)
        const id = session.containerId
        const ownedContainer = await owned(id, run, side)
        observe({ containerId: id, imageId: ownedContainer.Image })
        const persistOutput = collectRunnerOutput(stdoutLog.write, stderrLog.write)
        const collectOutput = (value: typeof captured, final = false) => {
          Object.assign(captured, value)
          persistOutput(value, final)
        }
        const execution = await session.execute(
          [
            "/bin/sh",
            "-c",
            'node -e \'const {chromium}=require("@playwright/test"); chromium.launch().then(async b=>{require("fs").writeFileSync("/review/output/browser.txt",b.version());await b.close()})\' && NODE_OPTIONS=--require=/review/capture-viewport.cjs ./node_modules/.bin/playwright test --config /review/playwright.config.cjs --project ' +
              run.target,
          ],
          limits,
          signal,
          collectOutput,
        )
        collectOutput(execution, true)
        await Promise.all([stdoutLog.flush(), stderrLog.flush()])
        if (execution.resourceLimit) {
          observe({ resourceLimit: execution.resourceLimit })
        }
        if (execution.error) {
          throw new Error(redact(execution.error))
        }
        signal.throwIfAborted()
        const stage = join(inputs(run.id), `output-${side}`)
        await mkdir(stage, { recursive: true, mode: 0o700 })
        await session.copyOutput(stage)
        const reportPath = join(stage, "report.json")
        if (!existsSync(reportPath)) {
          throw new Error("Playwright did not finalize its report")
        }
        if (
          (await lstat(reportPath)).isSymbolicLink() ||
          (await lstat(reportPath)).size > 4 * 1024 * 1024
        ) {
          throw new Error("Invalid Playwright report")
        }
        const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")))
        const dest = output(run.id, side)
        await mkdir(dest, { recursive: true, mode: 0o700 })
        let bytes = 0
        for (const artifact of report.cases.flatMap((c) => c.artifacts)) {
          const path = join(stage, artifact.id),
            stat = await lstat(path)
          bytes += stat.size
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size !== artifact.bytes ||
            bytes > 256 * 1024 * 1024
          ) {
            throw new Error("Invalid capture artifact or size limit exceeded")
          }
          const data = await readFile(path)
          if (createHash("sha256").update(data).digest("hex") !== artifact.sha256) {
            throw new Error("Capture artifact identity mismatch")
          }
          await writeFile(join(dest, artifact.id), data, { flag: "wx", mode: 0o600 })
        }
        const browserVersion = await readFile(join(stage, "browser.txt"), "utf8")
        if (!report.cases.length) {
          throw new Error(report.errors.join("\n") || "No Playwright scenarios executed")
        }
        result = { cases: report.cases, outcome: report.outcome, browserVersion }
      } catch (error) {
        executionFailure = describeFailure(error)
      } finally {
        try {
          if (!sessions.has(`${run.id}:${side}`)) {
            await Promise.all([stdoutLog.finish(), stderrLog.finish()])
          } else {
            await Promise.all([stdoutLog.flush(), stderrLog.flush()])
          }
        } catch (error) {
          const detail = `Log persistence failed: ${redact(error instanceof Error ? error.message : String(error)).slice(-16384)}`
          if (executionFailure) {
            executionFailure.message += `\n${detail}`
          } else {
            executionFailure = describeFailure(new Error(detail))
          }
        }
      }
      if (executionFailure) {
        throw executionFailure
      }
      if (!result) {
        throw new Error("Playwright execution did not produce a result")
      }
      return result
    },
    async stop(run, side) {
      const recorded = run[side]
      if (recorded.runtimeId) {
        await verifyRuntime(recorded.runtimeId)
        const key = `${run.id}:${side}`
        const session = sessions.get(key)
        if (session) {
          try {
            await session.stop()
          } finally {
            sessions.delete(key)
          }
        } else {
          // Recovery covers resources retained by older versions or a lost worker.
          const containers = await containersWithLabels([
            `io.redpact.owner=${ownerId}`,
            `io.redpact.capture=${run.id}`,
            `io.redpact.capture-side=${side}`,
          ])
          for (const container of containers) {
            await owned(container.Id, run, side)
            await removeContainer(container.Id)
          }
        }
      }
    },
    async removeInputs(id) {
      await rm(inputs(id), { recursive: true, force: true })
    },
  }
}
