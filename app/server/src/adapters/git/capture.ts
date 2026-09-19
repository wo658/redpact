import { execFile, spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function captureGit(args: string[], env: NodeJS.ProcessEnv, maxBuffer: number) {
  try {
    return await execute("git", args, { env, timeout: 10000, maxBuffer })
  } catch (error) {
    if (process.platform !== "darwin" || (error as NodeJS.ErrnoException).code !== "EBADF") {
      throw error
    }
    return captureWithoutPipes(args, env, maxBuffer)
  }
}

async function captureWithoutPipes(args: string[], env: NodeJS.ProcessEnv, maxBuffer: number) {
  const directory = await mkdtemp(join(tmpdir(), "redpact-git-output-"))
  const output = join(directory, "stdout")
  const errors = join(directory, "stderr")
  try {
    // macOS cannot dup high-numbered pipe FDs; the shell opens bounded capture files after exec.
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        'out=$1; err=$2; blocks=$3; shift 3; ulimit -f "$blocks" || exit 125; exec git "$@" >"$out" 2>"$err"',
        "redpact-git",
        output,
        errors,
        String(Math.ceil(maxBuffer / 512)),
        ...args,
      ],
      { env, stdio: "inherit", timeout: 10000 },
    )
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject)
        child.once("exit", (code, signal) => resolve({ code, signal }))
      },
    )
    const [stdout, stderr] = await Promise.all([readFile(output, "utf8"), readFile(errors, "utf8")])
    const exceeded =
      result.signal === "SIGXFSZ" ||
      Buffer.byteLength(stdout) > maxBuffer ||
      Buffer.byteLength(stderr) > maxBuffer
    if (result.code !== 0 || exceeded) {
      throw Object.assign(
        new Error(stderr.trim() || `Git failed: ${result.signal ?? result.code}`),
        {
          ...result,
          ...(exceeded ? { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" } : {}),
          stdout,
          stderr,
        },
      )
    }
    return { stdout, stderr }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
