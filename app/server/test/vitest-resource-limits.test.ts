import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createVitestRunner } from "../src/adapters/test-runner/vitest.js"
import { testResourceSchema } from "../src/core/test-resource-schema.js"

test("자원 한도의 기본값은 유한하고 부분 설정은 나머지 기본값을 유지한다", () => {
  expect(testResourceSchema.parse({})).toEqual({ memoryMiB: 2048, timeoutSeconds: 600 })
  expect(testResourceSchema.parse({ memoryMiB: 512 })).toEqual({
    memoryMiB: 512,
    timeoutSeconds: 600,
  })
})

test("Vitest 실행은 선택한 한도로 무한 루프를 종료하고 다음 실행은 새 설정을 읽는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "vitest-limits-"))
  let limits = { memoryMiB: 512, timeoutSeconds: 2 }
  const runner = createVitestRunner(root, async () => limits)
  const signal = AbortSignal.timeout(15000)
  try {
    const result = await runner.execute(
      {
        files: [
          {
            path: "loop.test.ts",
            source: `import { test } from 'vitest'; import { writeFileSync } from 'node:fs'; test('동기 루프', () => { writeFileSync(${JSON.stringify(join(root, "started"))}, 'loop-started'); while(true) {} })`,
          },
        ],
      } as never,
      "loop",
      signal,
    )
    expect(result.outcome).toBe("execution_error")
    expect(result.resourceLimit).toMatchObject({ kind: "time", source: "wall_clock", limits })
    expect(result.errors.join(" ")).toContain("Time limit exceeded (2 seconds)")
    expect(await readFile(join(root, "started"), "utf8")).toContain("loop-started")
    limits = { memoryMiB: 1024, timeoutSeconds: 10 }
    const next = await runner.execute(
      {
        files: [
          {
            path: "pass.test.ts",
            source: `import { test, expect } from 'vitest'; test('정상 완료', () => { console.error('JavaScript heap out of memory'); expect(1).toBe(1) })`,
          },
        ],
      } as never,
      "next",
      signal,
    )
    expect(next.outcome).toBe("passed")
    expect(next.resourceLimit).toBeUndefined()
    expect(await readFile(join(root, "runs/next/vitest.config.mjs"), "utf8")).toContain(
      "--max-old-space-size=768",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 18000)
