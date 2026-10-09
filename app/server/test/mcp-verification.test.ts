import { randomUUID } from "node:crypto"
import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

function fixture() {
  const worktreeId = randomUUID()
  const id = randomUUID()
  const artifactId = randomUUID()
  const captured = {
    id,
    worktreeId,
    after: {
      cases: [
        { artifacts: [{ id: artifactId, contentType: "image/png", bytes: 3, sha256: "snapshot" }] },
      ],
    },
  }
  const services = {
    worktrees: {
      connect: vi.fn(async () => ({ id: "project" })),
      ensure: vi.fn(async () => ({ id: worktreeId })),
      listProjects: vi.fn(async () => [{ id: "project" }]),
      listWorktrees: vi.fn(async () => [{ id: worktreeId, projectRoot: "/repo/feature" }]),
    },
    unitTests: {
      start: vi.fn(async () => ({ id, worktreeId, state: "queued" })),
      get: vi.fn(() => ({ id, state: "finished", outcome: "failed", exitCode: 1 })),
      cancel: vi.fn(async () => ({ id, outcome: "cancelled" })),
    },
    captureWorkflow: {
      start: vi.fn(async () => captured),
      cancel: vi.fn(async () => ({ id, outcome: "cancelled" })),
    },
    captures: {
      get: vi.fn(() => captured),
      source: vi.fn(async () => "recorded Playwright source"),
      artifact: vi.fn(async () => ({ contentType: "image/png", data: new Uint8Array([1, 2, 3]) })),
    },
    runs: {
      get: vi.fn(() => ({ id, submissionId: "submission" })),
      listForWorktree: vi.fn(() => ({ items: [{ id, kind: "unit" }], nextCursor: "next" })),
      copyLog: vi.fn(async () => ({ text: "Recorded failure\nassertion failed" })),
    },
    submissions: {
      get: vi.fn(() => ({
        id: "submission",
        digest: "captured-digest",
        files: [{ path: "case.test.ts", source: "captured Integration source" }],
      })),
    },
    executeTests: { cancel: vi.fn(() => ({ id, state: "cancelled" })) },
    reviews: {
      policy: vi.fn(() => "auto"),
      get: vi.fn(() => undefined),
      cancel: vi.fn(async () => undefined),
    },
  }
  const app = createApp(services as unknown as Services)
  async function call(name: string, args: object) {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Host: "localhost",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
    return (await response.json()).result
  }
  return { services, call, id, worktreeId, artifactId }
}

test("Unit과 Playwright는 요청한 기존 체크아웃의 동일 실행 워크플로를 사용한다", async () => {
  const { call, services, worktreeId } = fixture()
  const unit = await call("run_unit_tests", { path: "/repo/feature" })
  expect(unit.isError).not.toBe(true)
  expect(services.worktrees.ensure).toHaveBeenCalledWith("project", "/repo/feature")
  expect(services.unitTests.start).toHaveBeenCalledWith(worktreeId)
  const viewport = { width: 390, height: 844 }
  const playwright = await call("run_playwright", {
    path: "/repo/feature",
    target: "functional",
    viewport,
  })
  expect(playwright.isError).not.toBe(true)
  expect(services.captureWorkflow.start).toHaveBeenCalledWith(
    worktreeId,
    undefined,
    viewport,
    "functional",
  )
  expect(
    (await call("run_unit_tests", { path: "/repo/feature", command: "arbitrary" })).isError,
  ).toBe(true)
  expect(
    (
      await call("run_playwright", {
        path: "/repo/feature",
        target: "functional",
        viewport: { width: 1, height: 1 },
      })
    ).isError,
  ).toBe(true)
})
test("Ask 정책에서는 새 실행이나 등록 없이 모델의 우회 실행을 거부한다", async () => {
  const { call, services } = fixture()
  services.reviews.policy.mockReturnValue("ask")
  for (const name of ["run_unit_tests", "run_playwright"]) {
    expect(
      (
        await call(name, {
          path: "/repo/feature",
          ...(name === "run_playwright" ? { target: "functional" } : {}),
        })
      ).isError,
    ).toBe(true)
  }
  expect(services.worktrees.connect).not.toHaveBeenCalled()
  expect(services.unitTests.start).not.toHaveBeenCalled()
  expect(services.captureWorkflow.start).not.toHaveBeenCalled()
})
test("이력 조회는 등록이나 실행을 하지 않고 체크아웃과 페이지 커서를 보존한다", async () => {
  const { call, services, worktreeId } = fixture()
  const listed = await call("list_executions", { path: "/repo/feature", before: "cursor" })
  expect(listed.structuredContent).toMatchObject({ worktreeId, nextCursor: "next" })
  expect(services.runs.listForWorktree).toHaveBeenCalledWith(worktreeId, "cursor")
  expect((await call("list_executions", { path: "/unobserved" })).structuredContent.items).toEqual(
    [],
  )
  expect(services.worktrees.connect).not.toHaveBeenCalled()
})
test("실패 로그와 기록 당시 소스·이미지를 모델에 제공한다", async () => {
  const { call, services, id, artifactId } = fixture()
  expect((await call("get_execution", { kind: "unit", id })).structuredContent.run.exitCode).toBe(1)
  expect(
    (await call("get_execution", { kind: "unit", id, detail: "log" })).structuredContent.text,
  ).toContain("assertion failed")
  const source = await call("get_execution", {
    kind: "integration",
    id,
    detail: "source",
    sourcePath: "case.test.ts",
  })
  expect(source.structuredContent).toMatchObject({
    source: "captured Integration source",
    digest: "captured-digest",
  })
  expect(
    (
      await call("get_execution", {
        kind: "integration",
        id,
        detail: "source",
        sourcePath: "missing.ts",
      })
    ).isError,
  ).toBe(true)
  expect(
    (
      await call("get_execution", {
        kind: "playwright",
        id,
        detail: "source",
        sourcePath: "test.spec.ts",
      })
    ).structuredContent.source,
  ).toBe("recorded Playwright source")
  const image = await call("get_execution", { kind: "playwright", id, detail: "image", artifactId })
  expect(image.content).toContainEqual({ type: "image", mimeType: "image/png", data: "AQID" })
  expect(image.structuredContent).not.toHaveProperty("image")
  expect(services.captures.artifact).toHaveBeenCalledWith(id, "after", artifactId)
  expect(
    (
      await call("get_execution", {
        kind: "unit",
        id,
        detail: "source",
        sourcePath: "case.test.ts",
      })
    ).isError,
  ).toBe(true)
})
test("취소는 지정한 실행 종류의 기존 취소 동작만 호출한다", async () => {
  const { call, services, id } = fixture()
  for (const kind of ["unit", "playwright", "integration"]) {
    expect((await call("cancel_execution", { kind, id })).isError).not.toBe(true)
  }
  expect(services.unitTests.cancel).toHaveBeenCalledWith(id)
  expect(services.captureWorkflow.cancel).toHaveBeenCalledWith(id)
  expect(services.executeTests.cancel).toHaveBeenCalledWith(id)
  expect(services.worktrees.connect).not.toHaveBeenCalled()
})
