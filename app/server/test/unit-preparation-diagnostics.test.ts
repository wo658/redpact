import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ start: vi.fn() }))
vi.mock("../src/adapters/environment/runner-session.js", () => ({ startRunner: mocks.start }))
vi.mock("../src/adapters/environment/runtime.js", () => ({
  runtimeSocket: async () => "unix:///fake.sock",
  runtimeIdentity: async () => "runtime",
}))

import { createUnitContainer } from "../src/adapters/environment/unit-container.js"

const roots: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("준비 중 취소해도 청크 경계의 한국어 로그를 손상 없이 보존한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "unit-preparation-"))
  roots.push(root)
  await writeFile(join(root, "Dockerfile"), "FROM alpine:3.21\n")
  const abort = new AbortController()
  mocks.start.mockImplementation(async (_worker, _input, _signal, options) => {
    const bytes = Buffer.from("준비 실패 진단")
    options.diagnostic(bytes.subarray(0, 1), "stderr")
    options.diagnostic(bytes.subarray(1), "stderr")
    abort.abort(new Error("cancel preparation"))
    throw abort.signal.reason
  })
  const result = await createUnitContainer(join(root, "state"), "owner").execute(
    {
      id: "run",
      projectRoot: root,
      inputDigest: null,
      runtimeId: null,
      settings: { dockerfile: "Dockerfile", cwd: ".", command: "true", patterns: ["*.test.ts"] },
    } as never,
    abort.signal,
    () => {},
  )
  expect(result.outcome).toBe("cancelled")
  expect(result.stderr).toBe("준비 실패 진단")
})
