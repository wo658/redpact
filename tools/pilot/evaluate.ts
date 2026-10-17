import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"

export interface Evaluation {
  status: "passed" | "failed" | "infrastructure_error"
  tests: number | null
  passed: number | null
  failed: number | null
  accuracy: number | null
  infrastructureError: string | null
}

export function parseEvaluationTap(tap: string, exitCode: number | null): Evaluation {
  const count = (name: string) => {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))]
    return matches.length === 1 ? Number(matches[0][1]) : null
  }
  const tests = count("tests")
  const passed = count("pass")
  const failed = count("fail")
  const assertionFailures = [...tap.matchAll(/^\s+code: ['"]?ERR_ASSERTION['"]?\s*$/gm)].length
  const complete =
    tests !== null &&
    tests > 0 &&
    passed !== null &&
    failed !== null &&
    passed + failed === tests &&
    (count("cancelled") ?? 0) === 0
  const functional =
    complete && (failed === 0 ? exitCode === 0 : exitCode === 1 && assertionFailures === failed)
  if (!functional) {
    return {
      status: "infrastructure_error",
      tests,
      passed,
      failed,
      accuracy: null,
      infrastructureError:
        "Evaluator did not finish with a complete assertion result; inspect stdout.tap and stderr.log.",
    }
  }
  return {
    status: failed === 0 ? "passed" : "failed",
    tests,
    passed,
    failed,
    accuracy: passed / tests,
    infrastructureError: null,
  }
}

export interface EvaluateOptions {
  checkout: string
  taskId: "api" | "ui" | "retry"
  evidenceDirectory: string
  evaluationRoot?: string
  playwrightModule?: string
  timeoutMs?: number
}

// The orchestrator freezes candidate source before invoking this evaluator.
export async function evaluateCandidate(options: EvaluateOptions) {
  if (!isAbsolute(options.checkout) || !isAbsolute(options.evidenceDirectory)) {
    throw new Error("Checkout and evidence directory must be absolute.")
  }
  if (!["api", "ui", "retry"].includes(options.taskId)) {
    throw new Error("Unknown evaluation task.")
  }
  const timeoutMs = options.timeoutMs ?? 120_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Evaluation timeout must be positive.")
  }
  await mkdir(options.evidenceDirectory)
  await writeFile(join(options.evidenceDirectory, ".gitignore"), "*\n", { flag: "wx" })
  if (options.evaluationRoot && !isAbsolute(options.evaluationRoot)) {
    throw new Error("Evaluation root must be absolute.")
  }
  const evaluator = options.evaluationRoot
    ? join(options.evaluationRoot, `${options.taskId}.acceptance.ts`)
    : fileURLToPath(new URL(`./evaluation/${options.taskId}.acceptance.ts`, import.meta.url))
  const start = performance.now()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PILOT_CHECKOUT: options.checkout,
    PILOT_PLAYWRIGHT_MODULE: options.playwrightModule,
  }
  // Node's test runner otherwise inherits its parent's test context and skips discovery.
  delete env.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, ["--test", "--test-reporter=tap", evaluator], {
    cwd: options.checkout,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  let infrastructureError: string | null = null
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })
  const timer = setTimeout(() => {
    infrastructureError = `Evaluator timed out after ${timeoutMs} ms.`
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        child.kill("SIGKILL")
      }
    } else {
      child.kill("SIGKILL")
    }
  }, timeoutMs)
  child.on("error", (error) => {
    infrastructureError = error.message
  })
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve))
  clearTimeout(timer)
  const result = {
    ...parseEvaluationTap(stdout, exitCode),
    elapsedMs: performance.now() - start,
    exitCode,
    evidenceDirectory: options.evidenceDirectory,
  }
  if (infrastructureError) {
    result.status = "infrastructure_error"
    result.accuracy = null
    result.infrastructureError = infrastructureError
  }
  await Promise.all([
    writeFile(join(options.evidenceDirectory, "stdout.tap"), stdout, { flag: "wx" }),
    writeFile(join(options.evidenceDirectory, "stderr.log"), stderr, { flag: "wx" }),
    writeFile(
      join(options.evidenceDirectory, "evaluation.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { flag: "wx" },
    ),
  ])
  return result
}
