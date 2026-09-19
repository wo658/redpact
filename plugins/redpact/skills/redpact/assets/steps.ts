import { randomUUID } from "node:crypto"
import type { TestContext } from "vitest"

export function createSteps(context: TestContext) {
  let active = false
  let closed = false
  context.onTestFinished(() => {
    closed = true
  })
  return async function step<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
    if (active || closed) {
      throw new Error("Steps must be awaited sequentially within one test")
    }
    active = true
    const event = { id: randomUUID(), name, startedAt: Date.now() }
    const start = performance.now()
    const record = async (state: "started" | "passed" | "failed") => {
      if (closed) {
        return
      }
      await context.annotate(
        JSON.stringify({
          ...event,
          state,
          ...(state === "started" ? {} : { durationMs: performance.now() - start }),
        }),
        "redpact-step-v1",
      )
    }
    try {
      await record("started")
      let value: T
      try {
        value = await callback()
      } catch (error) {
        await record("failed")
        throw error
      }
      await record("passed")
      return value
    } finally {
      active = false
    }
  }
}
