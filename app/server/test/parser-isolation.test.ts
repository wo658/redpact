import type { Project as MorphProject } from "ts-morph"
import { expect, test, vi } from "vitest"

const projects: MorphProject[] = []
vi.mock("ts-morph", async (original) => {
  const morph = await original<typeof import("ts-morph")>()
  return {
    ...morph,
    Project: class extends morph.Project {
      constructor(options: ConstructorParameters<typeof morph.Project>[0]) {
        super(options)
        projects.push(this)
      }
    },
  }
})
const { parseSource } = await import("../src/adapters/parser/source.js")

test("정적 의도 파싱은 제출 파일만 분석하고 표준 라이브러리를 로드하지 않는다", () => {
  const review = parseSource(
    "isolated.test.ts",
    `import { test as scenario, expect as check } from 'vitest';
scenario('real', () => { check(1).toBe(1) });
function helper(scenario: Function) { scenario('shadow', () => {}); }`,
  )
  expect(review.scenarios.map((scenario) => scenario.title)).toEqual(["real"])
  expect(review.scenarios[0].assertions).toHaveLength(1)
  expect(projects).toHaveLength(1)
  expect(
    projects[0]
      .getProgram()
      .compilerObject.getSourceFiles()
      .map((file) => file.fileName),
  ).toEqual(["/isolated.test.ts"])
})
