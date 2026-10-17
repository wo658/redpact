import { expect, test } from "vitest"
import { settingsSchema } from "../src/core/settings-schema.js"
import { unitTestSettingsSchema } from "../src/core/unit-test-schema.js"
import { runTestsInput } from "../src/core/verification-schema.js"

test("shared executionScope defaults to all and accepts changed", () => {
  expect(settingsSchema.parse({}).tests.executionScope).toBe("all")
  expect(settingsSchema.parse({ tests: { executionScope: "changed" } }).tests.executionScope).toBe(
    "changed",
  )
})
test("every unified runner accepts an explicit executionScope override", () => {
  for (const kind of ["integration", "unit", "playwright"] as const) {
    expect(
      runTestsInput.safeParse({
        kind,
        path: "/project",
        executionScope: "changed",
        ...(kind === "playwright" ? { target: "tests" } : {}),
      }).success,
    ).toBe(true)
  }
})
test("Unit has an explicit executable and argv filter contract", () => {
  expect(
    unitTestSettingsSchema.safeParse({
      dockerfile: "Dockerfile",
      command: "pnpm test",
      patterns: ["test/*.test.ts"],
      fileCommand: { executable: "pnpm", args: ["exec", "vitest", "run", "--"] },
    }).success,
  ).toBe(true)
})
