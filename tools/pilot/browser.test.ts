import assert from "node:assert/strict"
import test from "node:test"
import { browserConfig, browserCreateArgs } from "./fixture/browser.ts"

test("browser runner pins an immutable image and creates a new isolated profile", () => {
  const args = browserCreateArgs(
    "pilot-net",
    `sha256:${"a".repeat(64)}`,
    "http://app.redpact.test:3000",
  )
  assert.ok(args.includes("--network"))
  assert.ok(args.includes("pilot-net"))
  assert.ok(args.includes("2048m"))
  assert.ok(!args.some((value) => value.includes("--volume") || value.includes("--mount")))
  assert.throws(
    () => browserCreateArgs("pilot-net", "redpact:latest", "http://app.redpact.test:3000"),
    /immutable/,
  )
})

test("browser configuration matches Redpact default functional execution", () => {
  const config = browserConfig("http://app.redpact.test:3000")
  assert.equal(config.workers, 1)
  assert.equal(config.retries, 0)
  assert.equal(config.use.locale, "ko-KR")
  assert.equal(config.use.timezoneId, "UTC")
  assert.deepEqual(config.use.viewport, { width: 1920, height: 1080 })
  assert.deepEqual(config.testMatch, [
    "/review/tests/worktree/baseline.spec.ts",
    "/review/tests/worktree/task.spec.ts",
  ])
})

test("capture target and desktop/mobile viewport remain explicit", () => {
  assert.deepEqual(browserConfig("http://app.redpact.test:3000", "capture", 390, 844).testMatch, [
    "/review/tests/worktree/capture.spec.ts",
  ])
  assert.deepEqual(
    browserConfig("http://app.redpact.test:3000", "functional", 1440, 900).use.viewport,
    {
      width: 1440,
      height: 900,
    },
  )
  assert.throws(
    () => browserConfig("http://app.redpact.test:3000", "functional", NaN, 900),
    /viewport/,
  )
  assert.throws(() => browserConfig("http://app.redpact.test:3000", "anything"), /Target/)
})
