import { expect, test } from "vitest"
import { parseSource } from "../src/adapters/parser/source.js"

/** 의도를 표시해도 실행하지 않은 검증을 통과로 표시하면 안 된다. */
test("extracts intent and assertion reasons without executing source", () => {
  const review = parseSource(
    "signup.test.ts",
    `
import { test, expect } from "vitest"
throw new Error("must never execute during submission")
/** 응답만 성공하고 DB 저장이 빠진 구현을 발견한다. */
test("persists user", () => {
  // DB 쓰기 누락을 발견한다.
  expect(null).not.toBeNull()
})`,
  )
  expect(review.scenarios).toHaveLength(1)
  expect(review.scenarios[0].intent).toContain("DB 저장")
  expect(review.scenarios[0].assertions[0]).toMatchObject({
    reason: "DB 쓰기 누락을 발견한다.",
    observed: "unknown",
  })
})

test("does not mistake a local function named test for Vitest", () => {
  expect(
    parseSource("x.ts", 'function test(a: string, b: () => void) {}; test("x", () => {})')
      .scenarios,
  ).toEqual([])
})

test("reports dynamic cases as unsupported instead of inventing scenarios", () => {
  const review = parseSource(
    "x.test.ts",
    'import { test } from "vitest"; test.each([1,2])("case %s", () => {})',
  )
  expect(review.limitations.some((message) => message.includes("dynamic test"))).toBe(true)
})
