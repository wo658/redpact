import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { classifyReport } from "../../core/results.js"
import { stepResultSchema } from "../../core/step-schema.js"
import { testPackage } from "../../core/test-package.js"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { TestRunner } from "../../core/types/contracts.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import { createDiagnosticLog } from "../environment/diagnostics.js"
import { collectRunnerOutput } from "../environment/runner-output.js"
import { type RunnerSession, startRunner } from "../environment/runner-session.js"
import { runnerNetwork, runtimeClient, runtimeSocket } from "../environment/runtime.js"
import { minimalEnvironment } from "../environment/testcontainers.js"

const require = createRequire(import.meta.url)
const reportSchema = z.object({
  cases: z.array(
    z.object({
      steps: z.array(stepResultSchema).max(200).optional(),
      name: z.string(),
      file: z.string(),
      state: z.string(),
      errors: z.array(
        z.object({ name: z.string(), message: z.string(), stack: z.string().optional() }),
      ),
    }),
  ),
  collectionErrors: z.array(z.string()),
  errors: z.array(z.string()),
})
export function createVitestRunner(
  dataDir: string,
  readLimits: ReadTestResources = async () => testResourceSchema.parse({}),
): TestRunner {
  return {
    version: [
      `vitest@${require("vitest/package.json").version}`,
      `node@${process.version}`,
      createHash("sha256")
        .update(readFileSync(new URL("../../../dist/runtime-lock.yaml", import.meta.url)))
        .update(readFileSync(new URL("./reporter.mjs", import.meta.url)))
        .update(readFileSync(new URL("./pnpm-lock.yaml", import.meta.url)))
        .update(readFileSync(new URL("./Dockerfile", import.meta.url)))
        .update(
          readFileSync(
            new URL(
              existsSync(new URL("./worker.js", import.meta.url)) ? "./worker.js" : "./worker.ts",
              import.meta.url,
            ),
          ),
        )
        .update("redpact-runner-v5-container-network")
        .digest("hex"),
    ].join(":"),
    async execute(
      submission,
      runId,
      signal,
      settings,
      environment,
      redactionValues = [],
      connections = { version: 1, services: {} },
    ) {
      if (signal.aborted) {
        return { outcome: "cancelled", cases: [], errors: [] }
      }
      const limits = testResourceSchema.parse(await readLimits())
      const heapMiB = Math.max(16, Math.floor(limits.memoryMiB * 0.75))
      const directory = join(dataDir, "runs", runId)
      const sourceDirectory = join(directory, "source")
      await mkdir(sourceDirectory, { recursive: true })
      for (const file of submission.files) {
        const path = join(sourceDirectory, file.path)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, file.source, { flag: "wx" })
      }
      await writeFile(
        join(directory, "connections.json"),
        JSON.stringify({ version: connections.version, services: connections.services }),
        { mode: 0o600 },
      )
      const reportPath = join(directory, "report.json")
      const configPath = join(directory, "vitest.config.mjs")
      await writeFile(
        configPath,
        `export default ${JSON.stringify({
          test: {
            root: "/review/source",
            include: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
            environment: "node",
            fileParallelism: false,
            maxWorkers: 1,
            pool: "forks",
            execArgv: [`--max-old-space-size=${heapMiB}`],
            testTimeout: settings?.tests.timeoutMs ?? 10000,
            hookTimeout: settings?.tests.timeoutMs ?? 10000,
            reporters: ["/runner/reporter.mjs"],
          },
        })}`,
      )
      if (!connections.runtime) {
        return {
          outcome: "environment_error",
          cases: [],
          errors: ["Managed runner network is unavailable"],
        }
      }
      let worker = new URL("./worker.js", import.meta.url)
      if (!existsSync(worker)) {
        worker = new URL("./worker.ts", import.meta.url)
      }
      const stderrLog = createDiagnosticLog(join(directory, "stderr.log"), redactionValues)
      const stdoutLog = createDiagnosticLog(join(directory, "stdout.log"), redactionValues)
      let session: RunnerSession | undefined
      let result: Awaited<ReturnType<TestRunner["execute"]>> | undefined
      const completed = (value: Awaited<ReturnType<TestRunner["execute"]>>) => {
        result = value
        return value
      }
      try {
        const runtime = await runtimeClient()
        session = await startRunner(
          worker,
          {
            assets: dirname(fileURLToPath(import.meta.url)),
            source: sourceDirectory,
            config: await readFile(configPath, "utf8"),
            id: runId,
            ...connections.runtime,
            network: connections.runtime.network
              ? (
                  await runtime.network.inspect(
                    runtime.network.getById(connections.runtime.network),
                  )
                ).Id
              : await runnerNetwork(
                  undefined,
                  connections.runtime.ownerId,
                  connections.runtime.environmentId,
                ),
            limits,
            connections: { version: connections.version, services: connections.services },
            environment: {
              ...environment,
              REDPACT_CONNECTIONS_FILE: "/review/connections.json",
              REDPACT_REPORT: "/review/output/report.json",
              REDPACT_REDACT_VALUES: JSON.stringify(redactionValues),
            },
          },
          signal,
          {
            timeout: 900000,
            redactions: redactionValues,
            environment: {
              ...minimalEnvironment(),
              DOCKER_HOST: await runtimeSocket(),
              DEBUG: "testcontainers:build,testcontainers:pull",
            },
            diagnostic: (chunk, stream) =>
              (stream === "stderr" ? stderrLog : stdoutLog).write(chunk),
            failure: (stderr) => `Integration runner preparation failed: ${stderr}`,
          },
        )
        const install = testPackage(submission.files)
          ? "pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace --config.manage-package-manager-versions=false && "
          : ""
        const collectOutput = collectRunnerOutput(stdoutLog.write, stderrLog.write)
        const processResult = await session.execute(
          [
            "/bin/sh",
            "-c",
            `cd /review/source && ${install}mkdir -p node_modules && ln -s /runner/node_modules/vitest node_modules/vitest && node --max-old-space-size=${heapMiB} /runner/node_modules/vitest/vitest.mjs run --config /review/vitest.config.mjs`,
          ],
          limits,
          signal,
          collectOutput,
        )
        const redact = (text: string) =>
          redactionValues
            .filter((value) => value.length > 0)
            .sort((a, b) => b.length - a.length)
            .reduce((result, value) => result.split(value).join("[REDACTED]"), text)
        // Persist command output independently of report/archive extraction.
        collectOutput(processResult, true)
        await stdoutLog.flush()
        await stderrLog.flush()
        let archiveError: string | undefined
        try {
          const output = join(directory, "output")
          await mkdir(output, { recursive: true, mode: 0o700 })
          await session.copyOutput(output)
          // Container artifacts cannot replace immutable inputs or host-collected diagnostics.
          const reserved = new Set([
            "output",
            "source",
            "stdout.log",
            "stderr.log",
            "connections.json",
            "vitest.config.mjs",
          ])
          for (const entry of await readdir(output)) {
            if (!reserved.has(entry)) {
              await cp(join(output, entry), join(directory, entry), { recursive: true })
            }
          }
        } catch (error) {
          archiveError = `Runner output collection failed: ${redact(error instanceof Error ? error.message : String(error))}`
        }
        if (processResult.resourceLimit) {
          return completed({
            outcome: "execution_error",
            cases: [],
            errors: [
              redact(processResult.error ?? "Resource limit exceeded"),
              ...(archiveError ? [archiveError] : []),
            ],
            resourceLimit: processResult.resourceLimit,
          })
        }
        if (signal.aborted) {
          return completed({
            outcome: "cancelled",
            cases: [],
            errors: archiveError ? [archiveError] : [],
          })
        }
        if (processResult.error) {
          return completed({
            outcome: "execution_error",
            cases: [],
            errors: [redact(processResult.error), ...(archiveError ? [archiveError] : [])],
          })
        }
        if (archiveError) {
          return completed({ outcome: "execution_error", cases: [], errors: [archiveError] })
        }
        try {
          const observed = await session.exec([
            "node",
            "-e",
            "const fs=require('fs'),crypto=require('crypto');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(p=>crypto.createHash('sha256').update(fs.readFileSync('/review/source/'+p)).digest('hex'))))",
            JSON.stringify(submission.files.map((file) => file.path)),
          ])
          const hashes: string[] = JSON.parse(observed.stdout)
          if (
            submission.files.some(
              (file, index) =>
                createHash("sha256").update(file.source).digest("hex") !== hashes[index],
            )
          ) {
            return completed({
              outcome: "unknown",
              cases: [],
              errors: ["Submitted source changed during execution"],
            })
          }
          const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")))
          await writeFile(reportPath, JSON.stringify(report), { mode: 0o600 })
          report.cases = report.cases.map((item) => ({
            ...item,
            file: relative("/review/source", item.file),
          }))
          return completed(classifyReport(report, processResult.exitCode ?? 1))
        } catch {
          return completed({
            outcome: "execution_error",
            cases: [],
            errors: ["Runner did not produce a valid report; inspect local run logs"],
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        stderrLog.write(message)
        const redact = (text: string) =>
          redactionValues
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)
            .reduce((result, value) => result.split(value).join("[REDACTED]"), text)
        return completed({
          outcome: signal.aborted ? "cancelled" : "execution_error",
          cases: [],
          errors: [redact(message)],
        })
      } finally {
        const recordFailure = (phase: string, error: unknown) => {
          const message = `${phase}: ${error instanceof Error ? error.message : String(error)}`
          const redacted = redactionValues
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)
            .reduce((text, value) => text.split(value).join("[REDACTED]"), message)
          if (result) {
            if (result.outcome === "passed") {
              result.outcome = "execution_error"
            }
            result.errors.push(redacted)
          }
          return redacted
        }
        try {
          await session?.stop()
        } catch (error) {
          stderrLog.write(recordFailure("Runner cleanup failed", error))
        }
        try {
          await Promise.all([stdoutLog.finish(), stderrLog.finish()])
        } catch (error) {
          recordFailure("Runner log persistence failed", error)
        }
      }
    },
  }
}
