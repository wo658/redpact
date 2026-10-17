import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ start: vi.fn() }))
vi.mock("../src/adapters/environment/runner-session.js", () => ({ startRunner: mocks.start }))
vi.mock("../src/adapters/environment/runtime.js", () => ({
  runtimeClient: async () => ({
    network: { getById: (id: string) => id, inspect: async (id: string) => ({ Id: id }) },
  }),
  runtimeSocket: async () => "unix:///fake.sock",
  runnerNetwork: async () => "network",
}))

import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"
import { resourceLimit } from "./helpers/resource-limit.js"

const roots: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test.each(["command", "timeout", "cancel"])(
  "아카이브와 정리가 모두 실패해도 원래 %s 원인과 수집 오류를 보존한다",
  async (cause) => {
    const controller = new AbortController()
    const root = await mkdtemp(join(tmpdir(), "runner-evidence-"))
    roots.push(root)
    const copy = vi.fn(async () => {
      expect(await readFile(join(root, "runs/run/stderr.log"), "utf8")).toContain(
        "original failure",
      )
      throw new Error("archive unavailable")
    })
    const stop = vi.fn(async () => {
      throw new Error("cleanup denied")
    })
    mocks.start.mockResolvedValue({
      containerId: "runner",
      copyOutput: copy,
      stop,
      execute: async () => {
        if (cause === "cancel") {
          controller.abort()
        }
        return {
          stdout: "partial output",
          stderr: "original failure",
          exitCode: 1,
          error: "primary execution error",
          ...(cause === "timeout" ? { resourceLimit } : {}),
        }
      },
    })
    const result = await createVitestRunner(root).execute(
      { files: [{ path: "case.test.ts", source: "test source" }] } as never,
      "run",
      controller.signal,
      undefined,
      undefined,
      [],
      {
        version: 1,
        services: {},
        runtime: { ownerId: "owner", environmentId: "env", network: "network" },
      },
    )
    expect(result.outcome).toBe(cause === "cancel" ? "cancelled" : "execution_error")
    if (cause !== "cancel") {
      expect(result.errors).toContain("primary execution error")
    }
    if (cause === "timeout") {
      expect(result.resourceLimit).toEqual(resourceLimit)
    }
    expect(result.errors).toContain("Runner output collection failed: archive unavailable")
    expect(result.errors).toContain("Runner cleanup failed: cleanup denied")
    expect(await readFile(join(root, "runs/run/stdout.log"), "utf8")).toContain("partial output")
    expect(await readFile(join(root, "runs/run/stderr.log"), "utf8")).toContain("original failure")
    expect(copy).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  },
)
