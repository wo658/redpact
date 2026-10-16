import { randomUUID } from "node:crypto"
import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 공개 경계에서 종류별 실행 입력과 취소 비노출 계약을 검증한다. */
test("통합 MCP는 실행 종류를 검증하고 테스트 취소 경로를 노출하지 않는다", async (context) => {
  const step = createSteps(context)
  await step("도구 목록에서 통합 진입점과 수동 환경 경계를 확인한다", async () => {
    const listed = await rpc<{ tools: { name: string }[] }>("tools/list", {})
    const names = listed.tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining([
        "configure",
        "run_tests",
        "get_run",
        "list_runs",
        "get_run_artifact",
        "project_container",
      ]),
    )
    for (const name of [
      "run_unit_tests",
      "run_playwright",
      "get_execution",
      "list_executions",
      "cancel_execution",
      "cancel_run",
      "stop_environment",
    ]) {
      expect(names).not.toContain(name)
    }
  })
  await step("다른 종류의 옵션과 상대 경로는 실행 전에 거부한다", async () => {
    for (const input of [
      { kind: "unit", path: "/app", tests: ["example.test.ts"] },
      { kind: "integration", path: "/app", target: "functional" },
      { kind: "playwright", path: "/app", target: "functional", tests: ["example.spec.ts"] },
      { kind: "unit", path: "relative" },
    ]) {
      const result = await rpc("tools/call", { name: "run_tests", arguments: input })
      expect(result.isError).toBe(true)
    }
  })
  await step(
    "모든 종류의 HTTP 취소는 존재하지 않으며 없는 증거도 성공으로 표시하지 않는다",
    async () => {
      const id = randomUUID()
      for (const path of [
        `/api/runs/${id}/cancel`,
        `/api/unit-runs/${id}/cancel`,
        `/api/playwright-runs/${id}/cancel`,
        `/api/execution-reviews/unit/${id}/cancel`,
      ]) {
        expect((await http(path, "POST")).status).toBe(404)
      }
      for (const kind of ["unit", "integration", "playwright"]) {
        expect(
          (await rpc("tools/call", { name: "get_run", arguments: { kind, id } })).isError,
        ).toBe(true)
      }
      expect(
        (
          await rpc("tools/call", {
            name: "get_run_artifact",
            arguments: { kind: "playwright", id, artifactId: randomUUID() },
          })
        ).isError,
      ).toBe(true)
    },
  )
  await step(
    "미관찰 체크아웃 이력과 수동 환경은 프로젝트를 암묵적으로 등록하지 않는다",
    async () => {
      const path = `/tmp/unobserved-${randomUUID()}`
      await node(
        `import {mkdirSync} from 'node:fs'; mkdirSync(JSON.parse(process.argv[1])); console.log('null');`,
        path,
      )
      const history = await rpc<{ structuredContent: { items: unknown[]; nextCursor: null } }>(
        "tools/call",
        { name: "list_runs", arguments: { path, kind: "unit" } },
      )
      expect(history.structuredContent.items).toEqual([])
      expect(history.structuredContent.nextCursor).toBeNull()
      expect(
        (
          await rpc("tools/call", {
            name: "project_container",
            arguments: { path, action: "start" },
          })
        ).isError,
      ).toBe(true)
    },
  )
})
