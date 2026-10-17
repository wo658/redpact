import { PassThrough } from "node:stream"
import { expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ logs: vi.fn() }))
vi.mock("testcontainers", () => ({
  getContainerRuntimeClient: async () => ({ container: { logs: mocks.logs } }),
  StartupCheckStrategy: class {
    async waitUntilReady() {}
  },
}))

import { createDiagnosticTail } from "../src/adapters/environment/diagnostics.js"
import { ServiceWait } from "../src/adapters/environment/service-wait.js"

test("서비스 출력의 UTF-8 청크 경계에서도 비밀 값을 가린다", async () => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  mocks.logs.mockResolvedValueOnce(stdout).mockResolvedValueOnce(stderr)
  const tail = createDiagnosticTail(["prefix한suffix"])
  const wait = new ServiceWait((text) => tail.write(Buffer.from(text)))
  await wait.waitUntilReady({ id: "container" } as never)
  const bytes = Buffer.from("before prefix한suffix after")
  const split = Buffer.byteLength("before prefix") + 1
  stdout.write(bytes.subarray(0, split))
  stdout.end(bytes.subarray(split))
  stderr.end()
  tail.finish()
  expect(tail.read()).toBe("before [REDACTED] after")
})
