import { expect, test } from "vitest"
import { executionSupportingPaths } from "../src/core/execution-support.js"

test("test helpers and runner configuration trigger a documented full target selection", () => {
  expect(
    executionSupportingPaths({
      changedPaths: [
        "tests/helper.ts",
        "tests/fixtures/input.json",
        "tests/deleted.test.ts",
        "src/app.ts",
        "package.json",
        "app/pnpm-lock.yaml",
        ".redpact/settings.json",
        "playwright.config.ts",
      ],
      testPatterns: ["tests/**/*.test.ts"],
      directories: ["tests"],
      configurationDirectories: [".", "app"],
    }),
  ).toEqual([
    ".redpact/settings.json",
    "app/pnpm-lock.yaml",
    "package.json",
    "playwright.config.ts",
    "tests/fixtures/input.json",
    "tests/helper.ts",
  ])
})
test("another target's changed tests and unrelated configuration do not broaden execution", () => {
  expect(
    executionSupportingPaths({
      changedPaths: ["ui/project/a.spec.ts", "ui/worktree/a.spec.ts", "other/package.json"],
      testPatterns: ["ui/**/*.spec.ts"],
      directories: ["ui"],
      configurationDirectories: ["."],
    }),
  ).toEqual([])
})
test("project-wide test patterns conservatively include root and nested helpers", () => {
  expect(
    executionSupportingPaths({
      changedPaths: ["helper.ts", "src/helper.ts", "a.test.ts"],
      testPatterns: ["**/*.test.ts"],
      directories: ["."],
      configurationDirectories: ["."],
    }),
  ).toEqual(["helper.ts", "src/helper.ts"])
})
