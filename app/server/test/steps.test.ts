import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test as unitTest } from "vitest"
import { createTestVitestRunner as createVitestRunner } from "./helpers/container-runner.js"

const test = unitTest.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")

test("preserves explicit step verdicts and unfinished steps from real Vitest annotations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-steps-"))
  try {
    const result = await createVitestRunner(directory).execute(
      {
        files: [
          {
            path: "flow.test.ts",
            source: `
import { test, expect } from "vitest"
test("dependent flow", async ({ annotate }) => {
  await annotate(JSON.stringify({ id: "one", name: "API", state: "started", startedAt: 100 }), "redpact-step-v1")
  await annotate(JSON.stringify({ id: "one", name: "API", state: "passed", startedAt: 100, durationMs: 4 }), "redpact-step-v1")
  await annotate(JSON.stringify({ id: "two", name: "API", state: "started", startedAt: 104 }), "redpact-step-v1")
  expect(1).toBe(2)
})`,
          },
        ],
      } as never,
      "steps",
      new AbortController().signal,
      undefined,
      {},
    )
    expect(result.outcome).toBe("assertion_failed")
    expect(result.cases[0]).toMatchObject({
      steps: [
        { id: "one", name: "API", state: "passed", durationMs: 4 },
        { id: "two", name: "API", state: "interrupted" },
      ],
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test.each(["examples/order-desk/tests/steps.ts", "plugins/redpact/skills/redpact/assets/steps.ts"])(
  "step helper %s records real verdicts and leaves later callbacks uncalled",
  async (relative) => {
    const directory = await mkdtemp(join(tmpdir(), "redpact-step-helper-"))
    try {
      const helper = await readFile(new URL(`../../../${relative}`, import.meta.url), "utf8")
      const result = await createVitestRunner(directory).execute(
        {
          files: [
            { path: "steps.ts", source: helper },
            {
              path: "flow.test.ts",
              source: `
import { test, expect } from "vitest"
import { createSteps } from "./steps"
test("dependent flow", async (context) => {
  const step = createSteps(context)
  const value = await step("Same name", () => 42)
  await step("Same name", () => expect(value).toBe(43))
  await step("Never reached", () => { throw new Error("should not execute") })
})`,
            },
          ],
        } as never,
        "helper",
        new AbortController().signal,
        undefined,
        {},
      )
      expect(result.outcome).toBe("assertion_failed")
      expect(result.cases[0]?.steps?.map((step) => step.state)).toEqual(["passed", "failed"])
      expect(new Set(result.cases[0]?.steps?.map((step) => step.id)).size).toBe(2)
      expect(result.cases[0]?.errors[0]?.message).toContain("expected 42 to be 43")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
