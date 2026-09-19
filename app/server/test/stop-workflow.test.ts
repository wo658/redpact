import { expect, test } from "vitest"
import type { EnvironmentService, RunService } from "../src/core/types/services.js"
import { createStopEnvironment } from "../src/workflows/stop-environment.js"

test("environment removal waits for run cancellation, with concurrent stop requests coalesced", async () => {
  const events: string[] = []
  let release!: () => void
  const runs = {
    unfinished: () => [],
    cancelAndWait: async () => {
      events.push("cancel")
      await new Promise<void>((resolve) => {
        release = resolve
      })
    },
  } as unknown as RunService
  const environments = {
    beginStop: async () => ({ id: "env", state: "stopping", runId: "run" }),
    completeStop: async () => {
      events.push("remove")
    },
  } as unknown as EnvironmentService
  const stop = createStopEnvironment({ runs, environments })
  await stop("env")
  await stop("env")
  expect(events).toEqual(["cancel"])
  release()
  await stop.idle()
  expect(events).toEqual(["cancel", "remove"])
})
test("cancellation failure retains resources and records retryable stop failure", async () => {
  let removed = false
  let failed = false
  const stop = createStopEnvironment({
    runs: {
      unfinished: () => [],
      cancelAndWait: async () => {
        throw new Error("process state uncertain")
      },
    } as unknown as RunService,
    environments: {
      beginStop: async () => ({ id: "env", state: "stopping", runId: "run" }),
      completeStop: async () => {
        removed = true
      },
      failStop: () => {
        failed = true
      },
    } as unknown as EnvironmentService,
  })
  await stop("env")
  await expect(stop.idle()).resolves.toBeUndefined()
  expect(removed).toBe(false)
  expect(failed).toBe(true)
})
