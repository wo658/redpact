import { expect, test } from "vitest"
import { prepareSubmissionSources } from "../src/core/submission-policy.js"

const files = [
  { path: "z.test.ts", source: "test('z', () => {})" },
  { path: "a.ts", source: "export const value = 1" },
]

test("제출 소스는 호출자 입력을 변경하지 않고 경로순으로 정규화한다", () => {
  const prepared = prepareSubmissionSources(files, "runner-1")
  expect(prepared.files.map((file) => file.path)).toEqual(["a.ts", "z.test.ts"])
  expect(files.map((file) => file.path)).toEqual(["z.test.ts", "a.ts"])
  expect(prepared.files[1]).not.toBe(files[0])
})

test("제출 식별 해시는 순서와 무관하고 소스 및 runner 버전에 종속된다", () => {
  const prepared = prepareSubmissionSources(files, "runner-1")
  expect(prepared.digest).toMatch(/^[a-f0-9]{64}$/)
  expect(prepareSubmissionSources([...files].reverse(), "runner-1").digest).toBe(prepared.digest)
  expect(prepareSubmissionSources(files, "runner-2").digest).not.toBe(prepared.digest)
  expect(
    prepareSubmissionSources([{ ...files[0], source: "changed" }], "runner-1").digest,
  ).not.toBe(prepared.digest)
})

test("경로 탈출과 중복 경로 및 불완전한 패키지는 제출할 수 없다", () => {
  expect(() => prepareSubmissionSources([{ path: "../a.test.ts", source: "" }], "v1")).toThrow(
    "Only relative source paths",
  )
  expect(() => prepareSubmissionSources([files[0], files[0]], "v1")).toThrow("Duplicate file path")
  expect(() =>
    prepareSubmissionSources([files[0], { path: "package.json", source: "{}" }], "v1"),
  ).toThrow("Supply a pinned")
  expect(() => prepareSubmissionSources([files[1]], "v1")).toThrow("At least one test file")
})
