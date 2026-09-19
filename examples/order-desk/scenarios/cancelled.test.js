import { setTimeout } from "node:timers/promises"
import { test } from "vitest"

// The example client cancels after Redpact reports the run as running.
test("cancel a pending payment review", async () => {
  await setTimeout(30000)
}, 45000)
