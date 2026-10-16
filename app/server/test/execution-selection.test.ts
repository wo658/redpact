import { describe, expect, test } from "vitest"
import { selectExecutionFiles } from "../src/core/execution-selection.js"

const files = ["tests/a.test.ts", "tests/b.test.ts", "tests/new.test.ts"]
const base = {
  requested: "changed" as const,
  baseRevision: "a".repeat(40),
  files,
  changedPaths: ["tests/a.test.ts", "tests/new.test.ts", "tests/deleted.test.ts"],
  supportingPaths: ["tests/helper.ts", "package.json"],
}
describe("execution file selection", () => {
  test("selects only live changed test files, retaining additions and excluding deletions", () => {
    expect(selectExecutionFiles(base)).toMatchObject({
      requested: "changed",
      resolved: "changed",
      files: ["tests/a.test.ts", "tests/new.test.ts"],
      reason: "changed_files",
    })
  })
  test("records helper/config fallback without mislabelling requested scope", () => {
    expect(selectExecutionFiles({ ...base, changedPaths: ["tests/helper.ts"] })).toMatchObject({
      requested: "changed",
      resolved: "all",
      files,
      reason: "supporting_inputs",
    })
  })
  test("implementation-only edits and deletion-only changes select no live tests", () => {
    for (const changedPaths of [["src/app.ts"], ["tests/deleted.test.ts"], []]) {
      expect(selectExecutionFiles({ ...base, changedPaths })).toMatchObject({
        files: [],
        reason: "no_changed_tests",
      })
    }
  })
  test("missing comparison rejects changed but all needs no Git base", () => {
    expect(() => selectExecutionFiles({ ...base, baseRevision: null })).toThrow(/comparison/)
    expect(selectExecutionFiles({ ...base, requested: "all", baseRevision: null }).files).toEqual(
      files,
    )
  })
  test("exact integration paths cannot combine with changed; all keeps explicit subset", () => {
    expect(() => selectExecutionFiles({ ...base, explicitFiles: [files[0]] })).toThrow(/explicit/)
    expect(
      selectExecutionFiles({ ...base, requested: "all", explicitFiles: [files[0]] }),
    ).toMatchObject({ resolved: "explicit", files: [files[0]], reason: "explicit_files" })
    expect(() =>
      selectExecutionFiles({ ...base, requested: "all", explicitFiles: ["missing.test.ts"] }),
    ).toThrow(/catalog/)
  })
  test("sorts and deduplicates captured files without mutating inputs", () => {
    const input = { ...base, requested: "all" as const, files: [files[1], files[0], files[1]] }
    expect(selectExecutionFiles(input).files).toEqual([files[0], files[1]])
    expect(input.files).toEqual([files[1], files[0], files[1]])
  })
})
