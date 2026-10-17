import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"
import { startCliRuntime } from "../../workflows/cli-runtime.js"
import type { CliIO } from "./commands.js"

export async function nodeCliIO(): Promise<CliIO> {
  const packageJson = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
  return {
    version: packageJson.version,
    cwd: process.cwd(),
    env: process.env,
    stdout: (text) => {
      process.stdout.write(text)
    },
    stderr: (text) => {
      process.stderr.write(text)
    },
    stdin: async () => {
      let input = ""
      for await (const chunk of process.stdin) {
        input += chunk
        if (Buffer.byteLength(input) > 1024 * 1024) {
          throw new Error("Input exceeds 1 MiB")
        }
      }
      return input
    },
    fetch: (url, init) =>
      fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30000) }),
    write: (path, bytes) => writeFile(path, bytes, { flag: "wx", mode: 0o600 }),
    open: (url) =>
      new Promise<void>((accept, reject) => {
        const executables: Record<string, string> = { darwin: "open", win32: "rundll32" }
        const executable = executables[process.platform] ?? "xdg-open"
        const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url]
        const child = spawn(executable, args, { stdio: "ignore" })
        child.once("error", reject)
        child.once("exit", (code) => {
          if (code === 0) {
            accept()
          } else {
            reject(new Error("Browser opener failed"))
          }
        })
      }),
    now: Date.now,
    sleep: (ms) => setTimeout(ms),
    start: (server, dataDir) => startCliRuntime(server, dataDir),
  }
}
