import assert from "node:assert/strict"
import test from "node:test"
import { integrationArgs, integrationConfig } from "./fixture/integration.ts"

test("integration runs pinned image without installation and with the managed HTTP hostname", () => {
  const args = integrationArgs("pilot-net", `sha256:${"a".repeat(64)}`)
  assert.ok(args.includes("APP_URL=http://app.redpact.test:3000"))
  assert.ok(args.at(-1)?.includes("/runner/node_modules/vitest/vitest.mjs"))
  assert.ok(!args.at(-1)?.includes("pnpm install"))
  assert.throws(() => integrationArgs("pilot-net", "mutable:latest"), /immutable/)
})

test("integration configuration matches managed Vitest isolation and timeouts", () => {
  const config = integrationConfig()
  assert.equal(config.test.pool, "forks")
  assert.equal(config.test.fileParallelism, false)
  assert.equal(config.test.maxWorkers, 1)
  assert.equal(config.test.testTimeout, 10000)
})
