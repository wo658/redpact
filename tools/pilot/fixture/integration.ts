import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)

export function integrationConfig() {
  return {
    test: {
      root: "/review/source",
      include: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
      environment: "node",
      fileParallelism: false,
      maxWorkers: 1,
      pool: "forks",
      execArgv: ["--max-old-space-size=1536"],
      testTimeout: 10000,
      hookTimeout: 10000,
      reporters: ["default", "json"],
      outputFile: { json: "/review/output/results.json" },
    },
  }
}

export function integrationArgs(network: string, image: string): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("An immutable sha256 Docker image ID is required")
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network)) {
    throw new Error("Invalid Docker network")
  }
  return [
    "create",
    "--network",
    network,
    "--memory",
    "2048m",
    "--label",
    "io.redpact.pilot-integration=true",
    "--env",
    "APP_URL=http://app.redpact.test:3000",
    image,
    "/bin/sh",
    "-c",
    'node -e \'require("fs").writeFileSync("/review/output/fingerprint.json",JSON.stringify({nodeVersion:process.version,vitestVersion:require("/runner/node_modules/vitest/package.json").version,platform:process.platform,architecture:process.arch,cachePolicy:"warm-image-fresh-container"}))\' && cd /review/source && mkdir -p node_modules && ln -s /runner/node_modules/vitest node_modules/vitest && timeout --signal=TERM --kill-after=5s 600s node --max-old-space-size=1536 /runner/node_modules/vitest/vitest.mjs run --config /review/vitest.config.mjs',
  ]
}

export async function runIntegration(network: string, image: string) {
  const args = integrationArgs(network, image)
  const temporary = await mkdtemp(join(tmpdir(), "pilot-integration-"))
  const output = resolve("artifacts", `integration-${Date.now()}`)
  let container: string | undefined
  let exitCode = 0
  try {
    await mkdir(output, { recursive: true })
    await writeFile(
      join(temporary, "vitest.config.mjs"),
      `export default ${JSON.stringify(integrationConfig())}`,
    )
    container = (await exec("docker", args)).stdout.trim()
    await exec("docker", ["cp", `${resolve("integration")}/.`, `${container}:/review/source`])
    await exec("docker", [
      "cp",
      join(temporary, "vitest.config.mjs"),
      `${container}:/review/vitest.config.mjs`,
    ])
    try {
      const result = await exec("docker", ["start", "--attach", container], {
        timeout: 630000,
        maxBuffer: 10 * 1024 * 1024,
      })
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string }
      process.stdout.write(failure.stdout ?? "")
      process.stderr.write(failure.stderr ?? failure.message)
      exitCode = 1
    }
    const state = JSON.parse(
      (await exec("docker", ["inspect", "--format", "{{json .State}}", container])).stdout,
    )
    if (state.Running) {
      await exec("docker", ["stop", "--time", "1", container])
    }
    exitCode = exitCode || Number(state.ExitCode) || (state.Running ? 1 : 0)
    await exec("docker", ["cp", `${container}:/review/output/.`, output])
    await writeFile(
      join(output, "execution.json"),
      JSON.stringify({ image, container, network, exitCode, state }, null, 2),
    )
    process.stdout.write(`Integration evidence: ${output}\n`)
    return exitCode
  } finally {
    if (container) {
      await exec("docker", ["rm", "--force", container])
    }
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [network, image] = process.argv.slice(2)
  if (!network || !image) {
    throw new Error("Usage: node integration.ts NETWORK IMAGE_ID")
  }
  process.exitCode = await runIntegration(network, image)
}
