import { expect, test } from "vitest"
import { collectRunnerOutput } from "../src/adapters/environment/runner-output.js"

test("누적 출력은 중복 없이 전달하며 다음 청크의 UTF-8 문자를 보존한다", () => {
  let stdout = "",
    stderr = ""
  const collect = collectRunnerOutput(
    (chunk) => {
      stdout += chunk
    },
    (chunk) => {
      stderr += chunk
    },
  )
  collect({ stdout: "hello �", stderr: "failure", truncated: false })
  expect(stdout).toBe("hello ")
  collect({ stdout: "hello 한글", stderr: "failure marker", truncated: false })
  collect({ stdout: "hello 한글", stderr: "failure marker", truncated: false }, true)
  expect(stdout).toBe("hello 한글")
  expect(stderr).toBe("failure marker")
})

test.each([{ redactions: [] }, { redactions: ["private-long-secret"] }])(
  "상위 출력 제한은 마스킹 후에도 로그에 표시한다 (%j)",
  async ({ redactions }) => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { createDiagnosticLog } = await import("../src/adapters/environment/diagnostics.js")
    const root = await mkdtemp(join(tmpdir(), "runner-truncated-"))
    try {
      const path = join(root, "stdout.log")
      const log = createDiagnosticLog(path, redactions)
      const collect = collectRunnerOutput(log.write, () => {})
      const output = {
        stdout: "private-long-secret".repeat(50000).slice(0, 256 * 1024),
        stderr: "",
        truncated: true,
      }
      collect(output)
      collect(output, true)
      await log.finish()
      const text = await readFile(path, "utf8")
      expect(text.includes("[Output truncated]")).toBe(true)
      expect(text.match(/\[Output truncated\]/g)).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
