import { spawn } from "node:child_process"
import { type FileHandle, mkdir, open, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { type RunMetadata, summarizeRun } from "./metrics.ts"

export interface MeasureConfig {
  cwd: string
  promptFile: string
  outputDirectory: string
  condition: "A" | "B" | "C"
  model: string
  reasoningEffort: string
  redpactUrl?: string
  timeoutMs: number
}

function validate(config: MeasureConfig) {
  if (!config || !["A", "B", "C"].includes(config.condition)) {
    throw new Error("condition must be A, B, or C")
  }
  for (const key of ["cwd", "promptFile", "outputDirectory"] as const) {
    if (typeof config[key] !== "string" || !isAbsolute(config[key])) {
      throw new Error(`${key} must be an absolute path`)
    }
  }
  if (
    typeof config.model !== "string" ||
    !config.model.trim() ||
    !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(
      config.reasoningEffort,
    )
  ) {
    throw new Error("An explicit model and valid reasoningEffort are required")
  }
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 2_147_483_647
  ) {
    throw new Error("timeoutMs must be a positive timer-safe integer")
  }
  if (config.condition === "C") {
    const url = new URL(config.redpactUrl ?? "")
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("redpactUrl must be HTTP(S) without embedded credentials")
    }
  }
}

function argumentsFor(config: MeasureConfig) {
  const args = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--json",
    "--sandbox",
    "workspace-write",
    "--disable",
    "plugins",
    "--disable",
    "multi_agent",
    "--color",
    "never",
    "-C",
    config.cwd,
    "-m",
    config.model,
    "-c",
    `model_reasoning_effort=${JSON.stringify(config.reasoningEffort)}`,
    "-c",
    "memories.use_memories=false",
    "-c",
    "memories.generate_memories=false",
  ]
  if (config.condition === "C") {
    args.push(
      "-c",
      `mcp_servers.redpact.url=${JSON.stringify(config.redpactUrl)}`,
      "-c",
      "mcp_servers.redpact.required=true",
    )
  }
  return [...args, "-"]
}

// The injected executable is available only to in-process tests, never CLI configuration.
export async function measureRun(
  config: MeasureConfig,
  executable: { command: string; args?: string[] } = { command: "codex" },
) {
  validate(config)
  const prompt = await readFile(config.promptFile, "utf8")
  await mkdir(config.outputDirectory, { mode: 0o700 })
  const save = (name: string, content: string) =>
    writeFile(join(config.outputDirectory, name), content, { flag: "wx", mode: 0o600 })
  await save(".gitignore", "*\n")
  const stdout = await open(join(config.outputDirectory, "events.jsonl"), "wx", 0o600)
  let stderr: FileHandle | undefined
  let metadata: RunMetadata & {
    elapsedMs: number
    signal: string | null
    timedOut: boolean
    resourceCleanupVerified: boolean
    condition: MeasureConfig["condition"]
    model: string
    reasoningEffort: string
  }
  try {
    stderr = await open(join(config.outputDirectory, "stderr.log"), "wx", 0o600)
    const started = performance.now()
    const child = spawn(executable.command, [...(executable.args ?? []), ...argumentsFor(config)], {
      cwd: config.cwd,
      shell: false,
      stdio: ["pipe", stdout.fd, stderr.fd],
    })
    let infrastructureError: string | null = null
    let timedOut = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      infrastructureError =
        "Execution timeout; descendant processes and test resources require inspection."
      child.kill("SIGTERM")
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000)
    }, config.timeoutMs)
    child.on("error", (error: NodeJS.ErrnoException) => {
      infrastructureError = `Spawn failed: ${error.code ?? "unknown"}`
    })
    child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        infrastructureError = `Prompt delivery failed: ${error.code ?? "unknown"}`
      }
    })
    child.stdin?.end(prompt)
    const result = await new Promise<{ exitCode: number | null; signal: string | null }>((done) =>
      child.once("close", (exitCode, signal) => done({ exitCode, signal })),
    )
    clearTimeout(timer)
    clearTimeout(killTimer)
    if (result.signal && !infrastructureError) {
      infrastructureError = `Process terminated by ${result.signal}`
    }
    metadata = {
      ...result,
      elapsedMs: performance.now() - started,
      infrastructureError,
      timedOut,
      resourceCleanupVerified: false,
      condition: config.condition,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
    }
  } finally {
    await stdout.close()
    await stderr?.close()
  }
  const summary = summarizeRun(
    await readFile(join(config.outputDirectory, "events.jsonl"), "utf8"),
    metadata,
  )
  await save("metadata.json", `${JSON.stringify(metadata, null, 2)}\n`)
  await save("summary.json", `${JSON.stringify(summary, null, 2)}\n`)
  return { metadata, summary }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) {
    throw new Error("Usage: node tools/pilot/measure.ts CONFIG.json")
  }
  const result = await measureRun(JSON.parse(await readFile(process.argv[2], "utf8")))
  console.log(JSON.stringify(result.summary, null, 2))
  if (result.summary.status !== "completed") {
    process.exitCode = 1
  }
}
