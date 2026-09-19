import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { execa } from "execa"
import { z } from "zod"
import { classifyReport } from "../../core/results.js"
import { stepResultSchema } from "../../core/step-schema.js"
import { testPackage } from "../../core/test-package.js"
import { testResourceSchema } from "../../core/test-resource-schema.js"
import type { TestRunner } from "../../core/types/contracts.js"
import type { ReadTestResources } from "../../core/types/test-resources.js"
import { minimalEnvironment } from "../environment/testcontainers.js"
import { createProcessCommand } from "./command.js"

const require = createRequire(import.meta.url)
const vitestRoot = dirname(require.resolve("vitest/package.json"))
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
        .update("redpact-runner-v4-resource-limits")
        .digest("hex"),
    ].join(":"),
    async execute(
      submission,
      runId,
      signal,
      settings,
      environment,
      secretValues = [],
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
      if (testPackage(submission.files)) {
        const version = await execa("pnpm", ["--version"], {
          env: minimalEnvironment(),
          extendEnv: false,
          reject: false,
          timeout: 10000,
        })
        if (version.stdout.trim() !== "11.2.2") {
          return {
            outcome: "execution_error",
            cases: [],
            errors: ["Test packages require pnpm 11.2.2"],
          }
        }
        const installation = await execa(
          "pnpm",
          [
            "install",
            "--frozen-lockfile",
            "--ignore-scripts",
            "--ignore-workspace",
            "--config.manage-package-manager-versions=false",
          ],
          {
            cwd: sourceDirectory,
            env: {
              ...minimalEnvironment(),
              CI: "true",
              npm_config_userconfig: "/dev/null",
              npm_config_globalconfig: "/dev/null",
            },
            extendEnv: false,
            cancelSignal: signal,
            forceKillAfterDelay: 2000,
            timeout: 120000,
            reject: false,
            maxBuffer: 1024 * 1024,
          },
        )
        if (installation.exitCode !== 0) {
          return {
            outcome: signal.aborted ? "cancelled" : "execution_error",
            cases: [],
            errors: ["Frozen test package installation failed"],
          }
        }
      }
      await mkdir(join(sourceDirectory, "node_modules"), { recursive: true })
      await symlink(vitestRoot, join(sourceDirectory, "node_modules", "vitest"), "junction")
      const connectionsPath = join(directory, "connections.json")
      await writeFile(connectionsPath, JSON.stringify(connections), { mode: 0o600, flag: "wx" })
      const reportPath = join(directory, "report.json")
      const configPath = join(directory, "vitest.config.mjs")
      await writeFile(
        configPath,
        `export default ${JSON.stringify({
          test: {
            root: sourceDirectory,
            include: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
            environment: "node",
            fileParallelism: false,
            maxWorkers: 1,
            pool: "forks",
            execArgv: [`--max-old-space-size=${heapMiB}`],
            testTimeout: settings?.tests.timeoutMs ?? 10000,
            hookTimeout: settings?.tests.timeoutMs ?? 10000,
            reporters: [fileURLToPath(new URL("./reporter.mjs", import.meta.url))],
          },
        })}`,
      )
      const processResult = await createProcessCommand().execute(
        sourceDirectory,
        process.execPath,
        [
          `--max-old-space-size=${heapMiB}`,
          join(vitestRoot, "vitest.mjs"),
          "run",
          "--config",
          configPath,
        ],
        signal,
        {
          ...minimalEnvironment(),
          ...environment,
          REDPACT_CONNECTIONS_FILE: connectionsPath,
          REDPACT_REPORT: reportPath,
          REDPACT_REDACT_VALUES: JSON.stringify(secretValues),
          REDPACT_TOKEN: undefined,
        },
        limits,
        2 * 1024 * 1024,
      )
      const redact = (text: string) =>
        secretValues
          .filter((value) => value.length > 0)
          .sort((a, b) => b.length - a.length)
          .reduce((result, value) => result.split(value).join("[REDACTED]"), text)
      await writeFile(join(directory, "stdout.log"), redact(processResult.stdout), { mode: 0o600 })
      await writeFile(join(directory, "stderr.log"), redact(processResult.stderr), { mode: 0o600 })
      if (processResult.resourceLimit) {
        return {
          outcome: "execution_error",
          cases: [],
          errors: [redact(processResult.error ?? "Resource limit exceeded")],
          resourceLimit: processResult.resourceLimit,
        }
      }
      if (signal.aborted) {
        return { outcome: "cancelled", cases: [], errors: [] }
      }
      if (processResult.error) {
        return { outcome: "execution_error", cases: [], errors: [redact(processResult.error)] }
      }
      try {
        for (const file of submission.files) {
          if ((await readFile(join(sourceDirectory, file.path), "utf8")) !== file.source) {
            return {
              outcome: "unknown",
              cases: [],
              errors: ["Submitted source changed during execution"],
            }
          }
        }
        const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")))
        await writeFile(reportPath, JSON.stringify(report), { mode: 0o600 })
        report.cases = report.cases.map((item) => ({
          ...item,
          file: relative(sourceDirectory, item.file),
        }))
        return classifyReport(report, processResult.exitCode ?? 1)
      } catch {
        return {
          outcome: "execution_error",
          cases: [],
          errors: ["Runner did not produce a valid report; inspect local run logs"],
        }
      }
    },
  }
}
