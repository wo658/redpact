import { expect, test } from "vitest"
import { createScheduler } from "../src/adapters/process/queue.js"

test("runs configured local work concurrently", async () => {
  const scheduler = createScheduler((key) => (key === "local" ? 2 : 1))
  let active = 0
  let maximum = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const task = () =>
    scheduler.add("local", async () => {
      active++
      maximum = Math.max(maximum, active)
      await gate
      active--
    })

  const first = task()
  const second = task()
  await expect.poll(() => maximum).toBe(2)
  release()
  await Promise.all([first, second])
})
