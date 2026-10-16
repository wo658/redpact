import { expect, test, vi } from "vitest"
import { settingsSchema } from "../src/core/settings-schema.js"
import { createExecutionScopes } from "../src/workflows/execution-scope.js"

function fixture() {
  const settings = settingsSchema.parse({
    tests: { directory: "tests", executionScope: "changed" },
    unitTests: { dockerfile: "Dockerfile", command: "test", patterns: ["unit/*.test.ts"] },
  })
  const changes = vi.fn(async () => ({ baseRevision: "a".repeat(40), paths: ["tests/a.test.ts"] }))
  const service = createExecutionScopes({
    worktrees: {
      resolve: async () => ({
        worktree: { projectId: "p", projectRoot: "/project" },
        settings: { read: async () => ({ valid: true, settings }) },
      }),
    } as never,
    projects: { tracking: async () => ({ mainBranch: "main" }) } as never,
    files: {
      changes,
      catalog: async () => ({
        files: ["tests/a.test.ts", "tests/b.test.ts"],
        testPatterns: ["tests/**/*.test.ts"],
        directories: ["tests"],
        configurationDirectories: ["."],
      }),
    },
  })
  return { service, changes, settings }
}
test("shared default and override use the same selection policy", async () => {
  const f = fixture()
  expect((await f.service.resolve("wt", { kind: "integration" })).files).toEqual([
    "tests/a.test.ts",
  ])
  expect(
    (await f.service.resolve("wt", { kind: "integration", executionScope: "all" })).files,
  ).toEqual(["tests/a.test.ts", "tests/b.test.ts"])
  expect(f.changes).toHaveBeenCalledTimes(1)
})
test("empty selection is explicit admission failure, never all or pass", async () => {
  const f = fixture()
  f.changes.mockResolvedValue({ baseRevision: "a".repeat(40), paths: [] })
  await expect(f.service.resolve("wt", { kind: "integration" })).rejects.toMatchObject({
    message: expect.stringContaining("No tests selected"),
    executionSelection: { files: [], reason: "no_changed_tests" },
  })
})
test("helper fallback and explicit file conflicts are preserved", async () => {
  const f = fixture()
  f.changes.mockResolvedValue({ baseRevision: "a".repeat(40), paths: ["tests/helper.ts"] })
  expect(await f.service.resolve("wt", { kind: "integration" })).toMatchObject({
    requested: "changed",
    resolved: "all",
    reason: "supporting_inputs",
  })
  await expect(
    f.service.resolve("wt", { kind: "integration", tests: ["a.test.ts"] }),
  ).rejects.toThrow("explicit")
  expect(
    (
      await f.service.resolve("wt", {
        kind: "integration",
        executionScope: "all",
        tests: ["a.test.ts"],
      })
    ).files,
  ).toEqual(["tests/a.test.ts"])
})
test("legacy all Unit commands do not invent a test-file list or require Git", async () => {
  const f = fixture()
  expect(await f.service.resolve("wt", { kind: "unit", executionScope: "all" })).toMatchObject({
    files: [],
    filesExact: false,
  })
  expect(f.changes).not.toHaveBeenCalled()
})
