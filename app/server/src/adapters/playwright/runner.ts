import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { z } from "zod"
import { captureCaseSchema } from "../../core/playwright-schema.js"
import {
  runnerConnections,
  runnerEnvironment,
  runnerServiceHost,
} from "../../core/runner-environment.js"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { Environment } from "../../core/types/environment.js"
import type { CaptureRun, CaptureRunner } from "../../core/types/playwright.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import { snapshotInputs } from "../environment/inputs.js"
import { executeLimitedContainer } from "../environment/limited-command.js"
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
  secretValues: (record: Environment) => string[] = () => [],
  readLimits: ReadTestResources = async () => testResourceSchema.parse({}),
  runnerSecrets: (record: Environment) => Record<string, string> = () => ({}),
): CaptureRunner {
  const inputs = (id: string) => join(directory, "playwright-inputs", id)
  const output = (id: string, side: string) => join(directory, "playwright-runs", id, side)
  async function docker(args: string[], timeout = 30000) {
    return (
      await execa("docker", args, {
        env: minimalEnvironment(),
        extendEnv: false,
        timeout,
        maxBuffer: 1024 * 1024,
      })
    ).stdout
  }
  async function verifyRuntime(runtimeId?: string) {
    const actual = (await docker(["info", "--format", "{{.ID}}"])).trim()
    if (!actual || (runtimeId && actual !== runtimeId)) {
      throw new Error("Docker runtime identity mismatch")
    }
    return actual
  }
  async function owned(id: string, run: CaptureRun, side: string) {
    const [v] = JSON.parse(await docker(["inspect", id]))
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
      const redactions = secretValues(environment)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
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
      const [container] = JSON.parse(await docker(["inspect", target.id]))
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
      observe({ runtimeId, platform: "linux", state: "running" })
      let worker = new URL("./worker.js", import.meta.url)
      if (!existsSync(worker)) {
        worker = new URL("./worker.ts", import.meta.url)
      }
      const child = execa(process.execPath, [fileURLToPath(worker)], {
        input: JSON.stringify({
          assets: dirname(fileURLToPath(import.meta.url)),
          tests: join(inputs(run.id), "tests"),
          config: `module.exports=${JSON.stringify(config)}`,
          ownerId,
          id: run.id,
          side,
          network: `${environment.projectName}_redpact-runner`,
          environment: {
            ...runnerEnvironment(environment.settings, runnerSecrets(environment)),
            REDPACT_CONNECTIONS_FILE: "/review/connections.json",
          },
          connections: runnerConnections(environment),
          redactions,
          uiLanguage: run.settings.uiLanguage,
          limits,
        }),
        ipc: true,
        detached: true,
        env: minimalEnvironment(),
        extendEnv: false,
        cancelSignal: signal,
        forceKillAfterDelay: 2000,
        timeout: 900000,
        reject: false,
        maxBuffer: 1024 * 1024,
      })
      let id: string
      try {
        const result = await child
        signal.throwIfAborted()
        if (result.exitCode !== 0) {
          throw new Error(`Playwright preparation failed: ${redact(result.stderr).slice(-65536)}`)
        }
        id = JSON.parse(result.stdout).containerId
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL")
          } catch {}
        }
      }
      const ownedContainer = await owned(id, run, side)
      observe({ containerId: id, imageId: ownedContainer.Image })
      const execution = await executeLimitedContainer(
        id,
        [
          "/bin/sh",
          "-c",
          'node -e \'const {chromium}=require("@playwright/test"); chromium.launch().then(async b=>{require("fs").writeFileSync("/review/output/browser.txt",b.version());await b.close()})\' && NODE_OPTIONS=--require=/review/capture-viewport.cjs ./node_modules/.bin/playwright test --config /review/playwright.config.cjs --project ' +
            run.target,
        ],
        signal,
        limits,
      )
      if (execution.resourceLimit) {
        observe({ resourceLimit: execution.resourceLimit })
      }
      if (execution.error) {
        throw new Error(redact(execution.error))
      }
      signal.throwIfAborted()
      const stage = join(inputs(run.id), `output-${side}`)
      await mkdir(stage, { recursive: true, mode: 0o700 })
      await docker(["cp", `${id}:/review/output/.`, stage])
      const reportPath = join(stage, "report.json")
      if (!existsSync(reportPath)) {
        throw new Error(
          `Playwright did not finalize its report: ${redact(execution.stderr).slice(-65536)}`,
        )
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
      return { cases: report.cases, outcome: report.outcome, browserVersion }
    },
    async stop(run, side) {
      const recorded = run[side]
      if (recorded.runtimeId) {
        await verifyRuntime(recorded.runtimeId)
        const ids = (
          await docker([
            "ps",
            "-aq",
            "--filter",
            `label=io.redpact.owner=${ownerId}`,
            "--filter",
            `label=io.redpact.capture=${run.id}`,
            "--filter",
            `label=io.redpact.capture-side=${side}`,
          ])
        )
          .split(/\s+/)
          .filter(Boolean)
        for (const id of ids) {
          await owned(id, run, side)
          await docker(["rm", "-fv", id])
        }
      }
    },
    async removeInputs(id) {
      await rm(inputs(id), { recursive: true, force: true })
    },
  }
}
