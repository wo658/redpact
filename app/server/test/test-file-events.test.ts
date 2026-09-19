import { expect, test } from "vitest"
import { eventScope } from "../src/workflows/event-scope.js"

test("통합테스트 화면은 소스와 Git 기준 및 해당 워크트리의 실행 변경을 함께 관찰한다", async () => {
  const target = {
    worktree: {
      id: "w",
      projectId: "p",
      projectRoot: "/checkout",
      checkoutRoot: "/checkout",
      gitdir: "/git/worktrees/w",
    },
    settings: { rulesRoot: "/primary" },
  }
  const services = {
    dataDirectory: "/runtime",
    worktrees: {
      resolve: async () => target,
      getProject: () => ({ location: { kind: "git", commonGitdir: "/git" } }),
    },
    submissions: { get: (id: string) => ({ worktreeId: id === "own" ? "w" : "other" }) },
    runs: { get: (id: string) => ({ target: { worktreeId: id === "own" ? "w" : "other" } }) },
  }
  let scope: Awaited<ReturnType<typeof eventScope>> | undefined
  try {
    scope = await eventScope(services as never, { worktreeId: "w", scope: "tests" })
  } catch {
    /* 기존 서버는 이 탐색 범위를 제공하지 않는다. */
  }
  expect(scope, "통합테스트 소스와 결과를 관찰하는 범위가 필요하다").toBeDefined()
  expect(scope?.roots.map((root) => root.path)).toEqual(
    expect.arrayContaining([
      "/checkout",
      "/git",
      "/primary",
      "/runtime/submissions",
      "/runtime/runs",
    ]),
  )
  expect(scope?.accepts("/checkout/tests/api.test.ts")).toBe(true)
  expect(scope?.accepts("/git/logs/refs/heads/feature")).toBe(true)
  expect(scope?.accepts("/runtime/runs/own/state.json")).toBe(true)
  expect(scope?.accepts("/runtime/runs/other/state.json")).toBe(false)
  expect(scope?.accepts("/runtime/submissions/other.json")).toBe(false)
})
