import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ start: vi.fn(), failFinalFlush: false }))
vi.mock("../src/adapters/environment/runner-session.js", () => ({ startRunner: mocks.start }))
vi.mock("../src/adapters/environment/runtime.js", () => ({
  runtimeIdentity: async () => "runtime",
  runtimeSocket: async () => "unix:///fake.sock",
  runnerNetwork: async () => "network",
  inspectContainer: async () => ({
    Image: "image",
    Config: {
      Labels: {
        "io.redpact.owner": "owner",
        "io.redpact.environment": "env",
        "io.redpact.capture": "run",
        "io.redpact.capture-side": "after",
      },
    },
  }),
}))

vi.mock("../src/adapters/environment/diagnostics.js", async (original) => {
  const actual = await original<typeof import("../src/adapters/environment/diagnostics.js")>()
  return {
    ...actual,
    createDiagnosticLog: (...args: Parameters<typeof actual.createDiagnosticLog>) => {
      const log = actual.createDiagnosticLog(...args)
      let flushes = 0
      return {
        ...log,
        flush: async () => {
          await log.flush()
          if (mocks.failFinalFlush && ++flushes > 1) {
            throw new Error("disk unavailable private-token")
          }
        },
      }
    },
  }
})

import { createCaptureRunner } from "../src/adapters/playwright/runner.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import type { CaptureRun } from "../src/core/types/playwright.js"
import { resourceLimit } from "./helpers/resource-limit.js"

const roots: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  mocks.failFinalFlush = false
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test.each([
  { limited: false, failFinalFlush: false },
  { limited: true, failFinalFlush: false },
  { limited: false, failFinalFlush: true },
])(
  "Playwright 수집 실패에도 원래 출력과 마스킹을 보존한다 (자원 제한=%s)",
  async ({ limited, failFinalFlush }) => {
    mocks.failFinalFlush = failFinalFlush
    const root = await mkdtemp(join(tmpdir(), "playwright-failure-"))
    roots.push(root)
    const copy = vi.fn(async () => {
      throw new Error("archive missing private-token")
    })
    mocks.start.mockResolvedValue({
      containerId: "runner",
      copyOutput: copy,
      stop: async () => {},
      execute: async () => ({
        stdout: "original stdout private-token",
        stderr: "original command cause private-token",
        truncated: false,
        exitCode: 1,
        error: limited ? "Memory limit exceeded" : null,
        ...(limited ? { resourceLimit } : {}),
      }),
    })
    const settings = settingsSchema.parse({
      playwright: {
        service: "app",
        port: 3000,
        targets: { functional: { purpose: "functional", testMatch: ["*.spec.ts"] } },
      },
    }).playwright!
    const run = {
      version: 1,
      worktreeId: "w",
      projectId: "p",
      projectRoot: root,
      revision: null,
      selection: { services: ["app"], select: {} },
      settingsDigest: "settings",
      sourceDigest: "source",
      appDigest: "app",
      createdAt: new Date().toISOString(),
      state: "running",
      before: { state: "unavailable", cases: [] },
      id: "run",
      target: "functional",
      purpose: "functional",
      settings,
      after: { state: "running", cases: [], runtimeId: "runtime" },
    } as CaptureRun
    const environment = {
      id: "env",
      runtimeId: "runtime",
      resources: [{ kind: "container", service: "app", id: "app" }],
      plan: { bindings: {}, activeServices: ["app"] },
      settings: { tests: { env: { TOKEN: "private-token" } } },
    }
    const runner = createCaptureRunner(root, "owner")
    try {
      const failure = await runner
        .execute(run, "after", environment as never, new AbortController().signal, () => {})
        .catch((error) => error)
      expect(failure).toBeInstanceOf(Error)
      expect(failure.message).toContain(limited ? "Memory limit exceeded" : "archive missing")
      expect(failure.message).toContain("original command cause [REDACTED]")
      expect(failure.message).toContain("original stdout [REDACTED]")
      expect(failure.message).not.toContain("private-token")
      if (failFinalFlush) {
        expect(failure.message).toContain("Log persistence failed: disk unavailable [REDACTED]")
      }
      expect(await readFile(join(root, "playwright-runs/run/after/stderr.log"), "utf8")).toContain(
        "original command cause",
      )
    } finally {
      await runner.stop(run, "after")
    }
  },
)
