import { writeFileSync } from "node:fs"
import { afterEach, expect, test, vi } from "vitest"

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})

test("Playwright removes secrets from failures and steps and excludes trace logs", async () => {
  vi.stubEnv("REDPACT_REDACT_VALUES", JSON.stringify(["private", "private-long-key"]))
  const path = "../src/adapters/playwright/reporter.mjs"
  const { default: Reporter } = await import(path)
  const reporter = new Reporter()
  reporter.onError({ message: "request private-long-key" })
  reporter.onTestEnd(
    { location: { file: "/review/tests/app.spec.ts" }, titlePath: () => ["private-long-key"] },
    {
      status: "failed",
      duration: 1,
      errors: [{ message: "private-long-key" }],
      steps: [
        {
          category: "test.step",
          title: "private-long-key",
          duration: 1,
          error: { message: "private-long-key" },
        },
      ],
      attachments: [
        { name: "trace", contentType: "application/zip", body: Buffer.from("private-long-key") },
      ],
    },
  )
  reporter.onEnd({ status: "failed" })
  expect(writeFileSync).toHaveBeenCalledTimes(1)
  const text = String(vi.mocked(writeFileSync).mock.calls[0][1])
  expect(text).toContain("[REDACTED]")
  expect(text).not.toContain("private")
  expect(text).not.toContain("long-key")
  expect(JSON.parse(text).cases[0].artifacts).toEqual([])
})
