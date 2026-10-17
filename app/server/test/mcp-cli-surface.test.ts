import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

function client(services: Partial<Services> = {}) {
  const app = createApp(services as Services)
  return async (method: string, params?: object) => {
    const response = await app.request("http://localhost:54318/mcp", {
      method: "POST",
      headers: {
        Host: "localhost",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
    return (await response.json()).result
  }
}

test("모델용 MCP는 수명주기와 열기만 노출하고 기존 업무 도구는 앱 전용으로 유지한다", async () => {
  const rpc = client()
  const { tools } = await rpc("tools/list")
  const visible = tools.filter(
    (tool: { _meta?: { ui?: { visibility?: string[] } } }) =>
      !tool._meta?.ui?.visibility || tool._meta.ui.visibility.includes("model"),
  )
  expect(visible.map((tool: { name: string }) => tool.name).sort()).toEqual([
    "open_redpact",
    "redpact_status",
    "stop_redpact_server",
  ])
  for (const name of [
    "configure",
    "run_tests",
    "get_run",
    "list_runs",
    "get_run_artifact",
    "get_workspace_status",
    "get_review_context",
  ]) {
    expect(tools.find((tool: { name: string }) => tool.name === name)._meta.ui.visibility).toEqual([
      "app",
    ])
  }
  for (const tool of tools) {
    expect(tool._meta?.ui?.resourceUri).toBeUndefined()
  }
  for (const name of ["review_action", "set_approval_policy", "project_container"]) {
    expect(tools.some((tool: { name: string }) => tool.name === name)).toBe(false)
  }
})

test("MCP 상태와 열기는 승인 capability를 공개하지 않고 종료는 공통 workflow를 사용한다", async () => {
  const stop = vi.fn()
  const rpc = client({ runtimeControl: { stop } })
  const status = await rpc("tools/call", { name: "redpact_status", arguments: {} })
  expect(status.structuredContent).toEqual({ state: "running", canStop: true })
  expect(status).not.toHaveProperty("_meta")
  const opened = await rpc("tools/call", { name: "open_redpact", arguments: {} })
  expect(opened.structuredContent).toEqual({ url: "http://localhost:54318/", reviewPath: "/" })
  expect(stop).not.toHaveBeenCalled()
  expect(
    (await rpc("tools/call", { name: "stop_redpact_server", arguments: {} })).structuredContent,
  ).toEqual({ state: "stopping" })
  expect(stop).toHaveBeenCalledOnce()
})

test("MCP 열기는 임의 URL과 불완전한 실행 식별자를 거부한다", async () => {
  const rpc = client()
  for (const args of [
    { kind: "unit" },
    { id: "00000000-0000-4000-8000-000000000001" },
    { url: "https://example.com" },
    { reviewPath: "//example.com" },
  ]) {
    const result = await rpc("tools/call", { name: "open_redpact", arguments: args })
    expect(result.isError).toBe(true)
  }
})

test("MCP 열기는 요청된 실행의 검토 URL만 반환하고 실행 내용과 비밀 값을 반환하지 않는다", async () => {
  const id = "00000000-0000-4000-8000-000000000001"
  const get = vi.fn(() => ({
    id,
    state: "finished",
    createdAt: "2026-10-17T00:00:00.000Z",
    settings: { command: "private-secret" },
    cleanup: { state: "finished" },
  }))
  const rpc = client({ unitTests: { get } } as never)
  const result = await rpc("tools/call", { name: "open_redpact", arguments: { kind: "unit", id } })
  const url = new URL(result.structuredContent.url)
  expect(url.origin).toBe("http://localhost:54318")
  expect(url.searchParams.get("kind")).toBe("unit")
  expect(url.searchParams.get("id")).toBe(id)
  expect(get).toHaveBeenCalledWith(id)
  expect(JSON.stringify(result)).not.toContain("private-secret")
  expect(result).not.toHaveProperty("_meta")
})
