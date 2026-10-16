import { expect, test, vi } from "vitest"
import { createRuntimeShutdown } from "../src/workflows/runtime-shutdown.js"

test("shutdown attempts every cleanup and reports all failures without releasing a possibly active writer", async () => {
  const events: string[] = []
  const release = vi.fn()
  const stop = createRuntimeShutdown(
    [
      {
        name: "observer",
        close() {
          events.push("observer")
          throw new Error("watcher failed")
        },
      },
      {
        name: "runner",
        async close() {
          events.push("runner")
          throw new Error("runner failed")
        },
      },
      {
        name: "environments",
        close() {
          events.push("environments")
        },
      },
    ],
    release,
  )
  const result = await stop().catch((error) => error)
  expect(events).toEqual(["observer", "runner", "environments"])
  expect(result).toBeInstanceOf(AggregateError)
  expect(result.errors.map((error: Error) => error.message)).toEqual([
    "Failed to close observer",
    "Failed to close runner",
  ])
  expect(release).not.toHaveBeenCalled()
})

test("repeated shutdown requests share completion and release only after all writers finish", async () => {
  const events: string[] = []
  let finish = () => {}
  const wait = new Promise<void>((resolve) => {
    finish = resolve
  })
  const release = vi.fn(() => {
    events.push("release")
  })
  const stop = createRuntimeShutdown(
    [
      {
        name: "runner",
        async close() {
          events.push("runner")
          await wait
        },
      },
      {
        name: "environments",
        close() {
          events.push("environments")
        },
      },
    ],
    release,
  )
  const first = stop()
  expect(stop()).toBe(first)
  expect(events).toEqual(["runner"])
  expect(release).not.toHaveBeenCalled()
  finish()
  await first
  expect(events).toEqual(["runner", "environments", "release"])
  await stop()
  expect(release).toHaveBeenCalledTimes(1)
})
