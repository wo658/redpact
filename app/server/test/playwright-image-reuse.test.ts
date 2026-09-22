import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  fromDockerfile: vi.fn(),
  inspect: vi.fn(),
  constructor: vi.fn(),
}))
vi.mock("execa", () => ({ execa: mocks.inspect }))
vi.mock("testcontainers", () => ({
  GenericContainer: class {
    static fromDockerfile = mocks.fromDockerfile
    constructor(image: string) {
      mocks.constructor(image)
    }
    withLabels() {
      return container
    }
  },
  Wait: { forLogMessage: vi.fn() },
}))
const container = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "then") {
        return undefined
      }
      if (key === "start") {
        return async () => ({ getId: () => "capture-container" })
      }
      return () => container
    },
  },
)
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

test("준비된 브라우저 러너 이미지는 다음 캡처에서 다시 빌드하지 않는다", async () => {
  mocks.build.mockResolvedValue(container)
  mocks.fromDockerfile.mockReturnValue({ build: mocks.build })
  mocks.inspect.mockResolvedValue({ stdout: "sha256:ready", exitCode: 0 })
  vi.spyOn(process, "stdin", "get").mockReturnValue(
    Readable.from([
      JSON.stringify({
        assets: fileURLToPath(new URL("../src/adapters/playwright", import.meta.url)),
        limits: { memoryMiB: 2048 },
      }),
    ]) as typeof process.stdin,
  )
  vi.spyOn(process.stdout, "write").mockReturnValue(true)
  vi.spyOn(process, "once").mockReturnValue(process)
  await import("../src/adapters/playwright/worker.js")
  expect(mocks.build).not.toHaveBeenCalled()
  expect(mocks.constructor).toHaveBeenCalledWith("sha256:ready")
})
