import { expect, test, vi } from "vitest"

const runtime = vi.hoisted(() => ({
  container: { getById: vi.fn((id) => ({ id })), inspect: vi.fn() },
}))
vi.mock("testcontainers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("testcontainers")>()),
  getContainerRuntimeClient: async () => runtime,
}))

import { ServiceWait } from "../src/adapters/environment/service-wait.js"

test.each([
  [{ Running: true }, "SUCCESS"],
  [{ Running: true, Health: { Status: "starting" } }, "PENDING"],
  [{ Running: true, Health: { Status: "healthy" } }, "SUCCESS"],
  [{ Running: true, Health: { Status: "unhealthy" } }, "FAIL"],
  [{ Running: false, Health: { Status: "healthy" } }, "FAIL"],
] as const)("서비스 상태 %j의 준비 판정은 %s이다", async (State, expected) => {
  runtime.container.inspect.mockResolvedValue({ State })
  expect(await new ServiceWait().checkStartupState({} as never, "service")).toBe(expected)
})
