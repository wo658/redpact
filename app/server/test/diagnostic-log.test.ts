import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import {
  createDiagnosticLog,
  createDiagnosticTail,
} from "../src/adapters/environment/diagnostics.js"

test("진단 발췌는 길이를 자르기 전에 청크 경계의 비밀값을 가린다", () => {
  const tail = createDiagnosticTail(["sensitive-token"], 32)
  tail.write(Buffer.from("cause: sensitive-"))
  tail.write(Buffer.from("token" + "x".repeat(27)))
  tail.finish()
  expect(tail.read()).not.toContain("token")
  expect(tail.read().length).toBeLessThanOrEqual(32)
})

test("진단 로그는 청크 경계의 비밀값을 가리고 종료 전에 저장한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-diagnostic-"))
  try {
    const path = join(root, "stderr.log")
    const log = createDiagnosticLog(path, ["secret-token", "secret"])
    log.write("build failed: sec")
    log.write("ret-to")
    log.write("ken; actual cause\n")
    await log.finish()
    expect(await readFile(path, "utf8").catch(() => "")).toBe(
      "build failed: [REDACTED]; actual cause\n",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("진단 로그는 잘림과 스트림 오류를 기록하고 UTF-8 청크를 보존한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-diagnostic-"))
  try {
    const path = join(root, "stderr.log")
    const log = createDiagnosticLog(path, [], 40)
    const bytes = Buffer.from("실패 원인\n")
    log.write(bytes.subarray(0, 2))
    log.write(bytes.subarray(2))
    log.write("x".repeat(100))
    log.failed(new Error("stream closed"))
    await log.finish()
    const output = await readFile(path, "utf8").catch(() => "")
    expect(output).toContain("실패 원인")
    expect(output).toContain("[Output truncated]")
    expect(output).toContain("[Log collection failed]")
    expect(Buffer.byteLength(output)).toBeLessThan(150)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
