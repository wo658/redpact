import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

for (const disconnect of ["end", "shutdown"]) {
  test(`데스크톱 부모의 ${disconnect} 요청은 서버와 쓰기 잠금을 정리한다`, async () => {
    const data = await mkdtemp(join(tmpdir(), "redpact-desktop-"))
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
        "serve",
        "--data-dir",
        data,
        "--port",
        "0",
      ],
      {
        env: { ...process.env, REDPACT_DESKTOP_CONTROL: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    const exit = once(child, "exit")
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    try {
      await expect.poll(() => /"port":(\d+)/.exec(output)?.[1], { timeout: 10000 }).toBeTruthy()
      const port = /"port":(\d+)/.exec(output)?.[1]
      expect((await fetch(`http://127.0.0.1:${port}/api/projects`)).status).toBe(200)
      if (disconnect === "end") {
        child.stdin.end()
      } else {
        child.stdin.write("shutdown\n")
      }
      await expect.poll(() => child.exitCode, { timeout: 3000 }).toBe(0)
      expect(existsSync(join(data, ".writer.lock"))).toBe(false)
    } finally {
      child.stdin.destroy()
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM")
      }
      await exit
      await rm(data, { recursive: true, force: true })
    }
  }, 20000)
}
