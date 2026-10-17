import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)

export function browserConfig(baseURL: string, target = "functional", width = 1920, height = 1080) {
  if (!["functional", "capture"].includes(target)) {
    throw new Error("Target must be functional or capture")
  }
  if (
    ![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 3840)
  ) {
    throw new Error("Invalid viewport")
  }
  return {
    testDir: "/review/tests",
    testMatch:
      target === "functional"
        ? ["/review/tests/worktree/baseline.spec.ts", "/review/tests/worktree/task.spec.ts"]
        : ["/review/tests/worktree/capture.spec.ts"],
    outputDir: "/review/results",
    workers: 1,
    retries: 0,
    timeout: 30000,
    globalTimeout: 600000,
    reporter: [["line"], ["json", { outputFile: "/review/output/results.json" }]],
    use: {
      browserName: "chromium",
      baseURL,
      viewport: { width, height },
      deviceScaleFactor: 1,
      locale: "ko-KR",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce",
      screenshot: "only-on-failure",
      trace: "on",
      video: "off",
    },
  }
}

export function browserCreateArgs(network: string, image: string, baseURL: string): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("An immutable sha256 Docker image ID is required")
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network)) {
    throw new Error("Invalid Docker network")
  }
  const url = new URL(baseURL)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("HTTP base URL required")
  }
  const fingerprint =
    'const {chromium}=require("@playwright/test");chromium.launch().then(async b=>{require("fs").writeFileSync("/review/output/fingerprint.json",JSON.stringify({browserVersion:b.version(),playwrightVersion:require("@playwright/test/package.json").version,platform:process.platform,architecture:process.arch,cachePolicy:"warm-image-fresh-container-profile"}));await b.close()})'
  return [
    "create",
    "--network",
    network,
    "--memory",
    "2048m",
    "--shm-size",
    "1024m",
    "--label",
    "io.redpact.pilot-browser=true",
    "--env",
    `APP_URL=${baseURL}`,
    image,
    "/bin/sh",
    "-c",
    `node -e '${fingerprint}' && ./node_modules/.bin/playwright test --config /review/playwright.config.cjs`,
  ]
}

export async function runBrowser(
  network: string,
  image: string,
  baseURL: string,
  target = "functional",
  width = 1920,
  height = 1080,
) {
  const args = browserCreateArgs(network, image, baseURL)
  const config = browserConfig(baseURL, target, width, height)
  const temporary = await mkdtemp(join(tmpdir(), "pilot-browser-"))
  const output = resolve("artifacts", `browser-${target}-${Date.now()}`)
  let container: string | undefined
  let exitCode = 0
  try {
    await mkdir(output, { recursive: true })
    await writeFile(
      join(temporary, "playwright.config.cjs"),
      `module.exports=${JSON.stringify(config)}`,
    )
    container = (await exec("docker", args)).stdout.trim()
    await exec("docker", ["cp", `${resolve("ui-tests")}/.`, `${container}:/review/tests`])
    await exec("docker", [
      "cp",
      join(temporary, "playwright.config.cjs"),
      `${container}:/review/playwright.config.cjs`,
    ])
    try {
      const result = await exec("docker", ["start", "--attach", container], {
        timeout: 630000,
        maxBuffer: 10 * 1024 * 1024,
      })
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string; code?: number }
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
    await exec("docker", ["cp", `${container}:/review/results`, output])
    await writeFile(
      join(output, "execution.json"),
      JSON.stringify(
        { image, container, network, baseURL, target, width, height, exitCode, state },
        null,
        2,
      ),
    )
    process.stdout.write(`Browser evidence: ${output}\n`)
    return exitCode
  } finally {
    if (container) {
      await exec("docker", ["rm", "--force", container])
    }
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [
    network,
    image,
    baseURL = "http://app.redpact.test:3000",
    target = "functional",
    width = "1920",
    height = "1080",
  ] = process.argv.slice(2)
  if (!network || !image) {
    throw new Error(
      "Usage: node browser.ts NETWORK IMAGE_ID [BASE_URL] [functional|capture] [WIDTH] [HEIGHT]",
    )
  }
  process.exitCode = await runBrowser(
    network,
    image,
    baseURL,
    target,
    Number(width),
    Number(height),
  )
}
