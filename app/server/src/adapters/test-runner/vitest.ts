import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
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
import { executeLimitedContainer } from "../environment/limited-command.js"
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
      const docker = (args: string[]) =>
        execa("docker", args, { env: minimalEnvironment(), extendEnv: false, timeout: 30000 })
      let worker = new URL("./worker.js", import.meta.url)
      if (!existsSync(worker)) {
        worker = new URL("./worker.ts", import.meta.url)
      }
      const child = execa(process.execPath, [fileURLToPath(worker)], {
        input: JSON.stringify({
          assets: dirname(fileURLToPath(import.meta.url)),
          source: sourceDirectory,
          config: await readFile(configPath, "utf8"),
          id: runId,
          ...connections.runtime,
          limits,
          connections: { version: connections.version, services: connections.services },
          environment: {
            ...environment,
            REDPACT_CONNECTIONS_FILE: "/review/connections.json",
            REDPACT_REPORT: "/review/output/report.json",
            REDPACT_REDACT_VALUES: JSON.stringify(secretValues),
          },
        }),
        ipc: true,
        detached: true,
        env: minimalEnvironment(),
        extendEnv: false,
        cancelSignal: signal,
        forceKillAfterDelay: 2000,
        timeout: 900000,
        reject: false,
      })
      try {
        let preparation: Awaited<typeof child>
        try {
          preparation = await child
        } finally {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL")
            } catch {}
          }
        }
        if (preparation.exitCode !== 0) {
          throw new Error("Integration runner preparation failed")
        }
        const id = JSON.parse(preparation.stdout).containerId
        const install = testPackage(submission.files)
          ? "pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace --config.manage-package-manager-versions=false && "
          : ""
        const processResult = await executeLimitedContainer(
          id,
          [
            "/bin/sh",
            "-c",
            `cd /review/source && ${install}mkdir -p node_modules && ln -s /runner/node_modules/vitest node_modules/vitest && node --max-old-space-size=${heapMiB} /runner/node_modules/vitest/vitest.mjs run --config /review/vitest.config.mjs`,
          ],
          signal,
          limits,
        )
        await docker(["cp", `${id}:/review/output/.`, directory])
        const redact = (text: string) =>
          secretValues
            .filter((value) => value.length > 0)
            .sort((a, b) => b.length - a.length)
            .reduce((result, value) => result.split(value).join("[REDACTED]"), text)
        await writeFile(join(directory, "stdout.log"), redact(processResult.stdout), {
          mode: 0o600,
        })
        await writeFile(join(directory, "stderr.log"), redact(processResult.stderr), {
          mode: 0o600,
        })
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
          const observed = await docker([
            "exec",
            id,
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
            return {
              outcome: "unknown",
              cases: [],
              errors: ["Submitted source changed during execution"],
            }
          }
          const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")))
          await writeFile(reportPath, JSON.stringify(report), { mode: 0o600 })
          report.cases = report.cases.map((item) => ({
            ...item,
            file: relative("/review/source", item.file),
          }))
          return classifyReport(report, processResult.exitCode ?? 1)
        } catch {
          return {
            outcome: "execution_error",
            cases: [],
            errors: ["Runner did not produce a valid report; inspect local run logs"],
          }
        }
      } finally {
        const found = await docker([
          "ps",
          "-aq",
          "--filter",
          `label=io.redpact.owner=${connections.runtime.ownerId}`,
          "--filter",
          `label=io.redpact.integration=${runId}`,
        ])
        for (const id of found.stdout.split(/\s+/).filter(Boolean)) {
          await docker(["rm", "-fv", id])
        }
      }
    },
  }
}
