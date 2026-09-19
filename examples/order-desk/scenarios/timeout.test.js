import { setTimeout } from "node:timers/promises"
import { test } from "vitest"

test("payment exceeds the scenario deadline", async () => {
  await setTimeout(5000)
}, 25)
