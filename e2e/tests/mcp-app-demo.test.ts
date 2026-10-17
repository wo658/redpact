import { expect, test } from "vitest"
import { rpc } from "./target"

test("런타임 MCP는 채팅 카드와 모델용 승인 도구 없이 검증 도구를 제공한다", async () => {
  const { tools } = await rpc<{ tools: { name: string; _meta?: { ui?: unknown } }[] }>(
    "tools/list",
    {},
  )
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    "configure",
    "get_review_context",
    "get_run",
    "get_run_artifact",
    "get_workspace_status",
    "list_runs",
    "project_container",
    "run_tests",
  ])
  expect(tools.every((tool) => !tool._meta?.ui)).toBe(true)
})
