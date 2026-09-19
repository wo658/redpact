import { expect, test } from "vitest"
import { eventScope } from "../src/workflows/event-scope.js"

const services = {
  dataDirectory: "/runtime",
  worktrees: {
    checkoutPaths: async () => ["/checkout"],
    getProject: () => ({ id: "p", location: { kind: "directory", root: "/checkout" } }),
    getWorktree: (id: string) => {
      if (id !== "own") {
        throw new Error("Unknown worktree")
      }
      return { projectId: "p" }
    },
    resolve: async () => ({
      worktree: { id: "own", projectId: "p", checkoutRoot: "/checkout", projectRoot: "/checkout" },
      settings: { rulesRoot: "/primary" },
    }),
  },
  captures: { get: () => ({ worktreeId: "own" }) },
  environments: { get: () => ({ target: { worktreeId: "own" } }) },
}

test("프로젝트 이벤트는 워크트리 기록 밖의 JSON 변경도 전달한다", async () => {
  const scope = await eventScope(services as never, { projectId: "p" })
  expect(scope.accepts("/runtime/worktrees/own.json")).toBe(true)
  expect(scope.accepts("/runtime/worktrees/other.json")).toBe(false)
  expect(scope.accepts("/runtime/projects/p.json")).toBe(true)
  expect(scope.accepts("/checkout/package.json")).toBe(true)
})

test("테스트 이벤트는 관찰 루트 밖의 경로를 받아들이지 않는다", async () => {
  const scope = await eventScope(services as never, { worktreeId: "own", scope: "tests" })
  expect(scope.accepts("/checkout/tests/example.test.ts")).toBe(true)
  expect(scope.accepts("/primary/.redpact/settings.json")).toBe(true)
  expect(scope.accepts("/other/tests/example.test.ts")).toBe(false)
  expect(scope.accepts("/")).toBe(false)
})

test("미리보기 이벤트는 캡처 기록 밖의 소스와 환경 변경을 전달한다", async () => {
  const scope = await eventScope(services as never, { worktreeId: "own", scope: "preview" })
  expect(scope.accepts("/runtime/playwright-runs/capture.json")).toBe(true)
  expect(scope.accepts("/runtime/environments/environment.json")).toBe(true)
  expect(scope.accepts("/checkout/src/screen.tsx")).toBe(true)
  expect(scope.accepts("/primary/.redpact/settings.json")).toBe(true)
})
