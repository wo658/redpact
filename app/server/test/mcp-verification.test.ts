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
    target: "functional",
    state: "finished",
    createdAt: "now",
    before: { state: "unavailable", cases: [] },
    after: {
      cases: [
        {
          file: "case.spec.ts",
          title: "example",
          status: "passed",
          errors: [],
          artifacts: [
            {
              id: artifactId,
              name: "Screenshot",
              contentType: "image/png",
              bytes: 3,
              sha256: "snapshot",
            },
          ],
        },
      ],
    },
  }
  const services = {
    worktrees: {
      observed: vi.fn(async (path: string) =>
        path === "/repo/feature"
          ? { projectId: "project", worktreeId, checkoutRoot: path, disconnected: false }
          : null,
      ),
      connect: vi.fn(async () => ({ id: "project" })),
      ensure: vi.fn(async () => ({ id: worktreeId })),
      listProjects: vi.fn(async () => [{ id: "project" }]),
      listWorktrees: vi.fn(async () => [{ id: worktreeId, projectRoot: "/repo/feature" }]),
    },
    unitTests: {
      start: vi.fn(async () => ({ id, worktreeId, state: "queued" })),
      get: vi.fn(() => ({
        id,
        state: "finished",
        outcome: "failed",
        exitCode: 1,
        settings: { command: "pnpm test" },
        cleanup: { state: "removed" },
        createdAt: "now",
      })),
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
    executionReviews: {
      request: vi.fn(async () => ({
        review: {
          id,
          kind: "unit",
          state: "pending",
          policy: "ask",
          revision: 0,
          path: "/repo/feature",
          worktreeId,
          createdAt: "now",
          settingsDigest: "settings",
          inputDigest: "input",
          specification: { command: "pnpm test", dockerfile: "Dockerfile", cwd: "." },
        },
      })),
      capability: vi.fn(() => "capability-secret"),
      get: vi.fn(() => undefined),
      list: vi.fn(() => []),
    },
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
    const body = await response.json()
    return body.result ?? { isError: true, error: body.error }
  }
  return { services, call, id, worktreeId, artifactId }
}

test("Unit과 Playwright는 요청한 기존 체크아웃의 동일 실행 워크플로를 사용한다", async () => {
  const { call, services, worktreeId } = fixture()
  const unit = await call("run_tests", { kind: "unit", path: "/repo/feature" })
  expect(unit.isError).not.toBe(true)
  expect(unit._meta?.redpact).toMatchObject({ kind: "execution", execution: { kind: "unit" } })
  expect(services.worktrees.ensure).toHaveBeenCalledWith("project", "/repo/feature")
  expect(services.unitTests.start).toHaveBeenCalledWith(worktreeId)
  const viewport = { width: 390, height: 844 }
  const playwright = await call("run_tests", {
    kind: "playwright",
    path: "/repo/feature",
    target: "functional",
    viewport,
  })
  expect(playwright.isError).not.toBe(true)
  expect(playwright._meta?.redpact).toMatchObject({
    kind: "execution",
    execution: { kind: "playwright" },
  })
  expect(services.captureWorkflow.start).toHaveBeenCalledWith(
    worktreeId,
    undefined,
    viewport,
    "functional",
  )
  expect(
    (await call("run_tests", { kind: "unit", path: "/repo/feature", command: "arbitrary" }))
      .isError,
  ).toBe(true)
  expect(
    (
      await call("run_tests", {
        kind: "playwright",
        path: "/repo/feature",
        target: "functional",
        viewport: { width: 1, height: 1 },
      })
    ).isError,
  ).toBe(true)
})
test("Ask 정책에서 실행 대신 검토 카드를 반환하고 UI 전용 승인을 기다린다", async () => {
  const { call, services, id } = fixture()
  services.reviews.policy.mockReturnValue("ask")
  const result = await call("run_tests", { kind: "unit", path: "/repo/feature" })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({ kind: "unit", state: "awaiting_approval", id })
  expect(JSON.stringify(result.structuredContent)).not.toContain("capability-secret")
  expect(result._meta.redpact.token).toBe("capability-secret")
  expect(services.unitTests.start).not.toHaveBeenCalled()
  expect(services.captureWorkflow.start).not.toHaveBeenCalled()
})
test("이력 조회는 등록이나 실행을 하지 않고 체크아웃과 페이지 커서를 보존한다", async () => {
  const { call, services, worktreeId } = fixture()
  const listed = await call("list_runs", { path: "/repo/feature", before: "cursor" })
  expect(listed.structuredContent).toMatchObject({ worktreeId, nextCursor: "next" })
  expect(services.runs.listForWorktree).toHaveBeenCalledWith(worktreeId, "cursor", undefined)
  expect(services.worktrees.listProjects).not.toHaveBeenCalled()
  expect(services.worktrees.listWorktrees).not.toHaveBeenCalled()
  expect((await call("list_runs", { path: "/unobserved" })).structuredContent.items).toEqual([])
  expect(services.worktrees.connect).not.toHaveBeenCalled()
})
test("실패 로그와 기록 당시 소스·이미지를 모델에 제공한다", async () => {
  const { call, services, id, artifactId } = fixture()
  expect((await call("get_run", { kind: "unit", id })).structuredContent.exitCode).toBe(1)
  expect(
    (await call("get_run", { kind: "unit", id, detail: "log" })).structuredContent.text,
  ).toContain("assertion failed")
  const source = await call("get_run", {
    kind: "integration",
    id,
    detail: "source",
    sourcePath: "case.test.ts",
  })
  expect(source._meta?.redpact).toMatchObject({
    kind: "evidence",
    evidence: { kind: "integration", detail: "source" },
  })
  expect(source.structuredContent).toMatchObject({
    source: "captured Integration source",
    digest: "captured-digest",
  })
  expect(
    (
      await call("get_run", {
        kind: "integration",
        id,
        detail: "source",
        sourcePath: "missing.ts",
      })
    ).isError,
  ).toBe(true)
  expect(
    (
      await call("get_run", {
        kind: "playwright",
        id,
        detail: "source",
        sourcePath: "test.spec.ts",
      })
    ).structuredContent.source,
  ).toBe("recorded Playwright source")
  const image = await call("get_run", { kind: "playwright", id, detail: "image", artifactId })
  expect(image.content).toContainEqual({ type: "image", mimeType: "image/png", data: "AQID" })
  expect(image.structuredContent).not.toHaveProperty("image")
  expect(services.captures.artifact).toHaveBeenCalledWith(id, "after", artifactId)
  expect(
    (
      await call("get_run", {
        kind: "unit",
        id,
        detail: "source",
        sourcePath: "case.test.ts",
      })
    ).isError,
  ).toBe(true)
})
test("사용자 취소 도구는 노출하지 않는다", async () => {
  const { call, services, id } = fixture()
  expect((await call("cancel_execution", { kind: "unit", id })).isError).toBe(true)
  expect(services.unitTests.cancel).not.toHaveBeenCalled()
})

test("산출물은 요청한 실행의 소유 범위를 벗어나지 않는다", async () => {
  const { call, services, id, artifactId } = fixture()
  const result = await call("get_run_artifact", { kind: "playwright", id, artifactId })
  expect(result.content).toContainEqual({ type: "image", mimeType: "image/png", data: "AQID" })
  services.captures.artifact.mockClear()
  expect(
    (await call("get_run_artifact", { kind: "playwright", id, artifactId: randomUUID() })).isError,
  ).toBe(true)
  expect(services.captures.artifact).not.toHaveBeenCalled()
})

test.each([
  { cleanupError: undefined, expected: "unknown" },
  { cleanupError: "Environment removal failed", expected: "failed" },
])(
  "Playwright 종료만으로 정리 성공을 표시하지 않는다: $expected",
  async ({ cleanupError, expected }) => {
    const { call, services, id } = fixture()
    Object.assign(services.captures.get(), {
      state: "finished",
      outcome: "error",
      error: "Environment preparation failed",
      cleanupError,
    })
    const result = await call("get_run", { kind: "playwright", id })
    expect(result._meta.redpact.execution.cleanup).toBe(expected)
  },
)

test("종류별 옵션은 다른 실행 종류에 전달되지 않는다", async () => {
  const { call, services } = fixture()
  for (const input of [
    { kind: "unit", path: "/repo/feature", tests: ["case.test.ts"] },
    { kind: "integration", path: "/repo/feature", target: "functional" },
    { kind: "playwright", path: "/repo/feature", tests: ["case.test.ts"], target: "functional" },
    { kind: "unit", path: "relative" },
    { kind: "playwright", path: "/repo/feature" },
  ]) {
    expect((await call("run_tests", input)).isError).toBe(true)
  }
  expect(services.unitTests.start).not.toHaveBeenCalled()
  expect(services.captureWorkflow.start).not.toHaveBeenCalled()
})

test("수동 환경 작업은 관찰된 프로젝트만 선택하고 테스트 실행에는 접근하지 않는다", async () => {
  const { call, services, worktreeId } = fixture()
  const testContainer = Object.fromEntries(
    ["inspect", "start", "restart", "stop"].map((action) => [
      action,
      vi.fn(async () => ({
        target: { projectRoot: "/repo/feature" },
        environment: null,
        issue: null,
      })),
    ]),
  )
  Object.assign(services, { testContainer })
  for (const action of ["inspect", "start", "restart", "stop"]) {
    const result = await call("project_container", { path: "/repo/feature", action })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent.target.projectRoot).toBe("/repo/feature")
    expect(testContainer[action]).toHaveBeenCalledWith("project", worktreeId)
  }
  expect((await call("project_container", { path: "/unknown", action: "start" })).isError).toBe(
    true,
  )
  expect(services.worktrees.connect).not.toHaveBeenCalled()
  expect(services.unitTests.cancel).not.toHaveBeenCalled()
  expect(services.captureWorkflow.cancel).not.toHaveBeenCalled()
})

test("로그 응답과 산출물 바이트는 상한을 지키고 생략을 알린다", async () => {
  const { call, services, id, artifactId } = fixture()
  services.runs.copyLog.mockResolvedValue({ text: "x".repeat(70000) })
  const log = await call("get_run", { kind: "unit", id, detail: "log" })
  expect(log.structuredContent.text).toHaveLength(65536)
  expect(log.structuredContent.truncated).toBe(true)
  services.captures.get().after.cases[0]!.artifacts[0]!.bytes = 9 * 1024 * 1024
  expect((await call("get_run_artifact", { kind: "playwright", id, artifactId })).isError).toBe(
    true,
  )
  expect(services.captures.artifact).not.toHaveBeenCalled()
})

test("명시적 종류 조회는 대규모 실패와 산출물을 제한하고 전체 개수와 상세 경로를 보존한다", async () => {
  const { call, services, id, artifactId } = fixture()
  Object.assign(services.captures.get(), {
    target: "functional",
    state: "finished",
    outcome: "failed",
    createdAt: "2026-10-17T00:00:00Z",
    projectRoot: "/repo/feature",
    projectId: "project",
    sourceDigest: "source-identity",
    settingsDigest: "settings-identity",
    appDigest: "app-identity",
    before: { state: "unavailable", cases: [] },
    after: {
      state: "finished",
      cases: Array.from({ length: 1000 }, (_, index) => ({
        title: `case-${index}`,
        file: "case.spec.ts",
        status: "failed",
        duration: 1,
        errors: ["failure ".repeat(1250)],
        steps: [],
        artifacts: [
          {
            id: artifactId,
            name: `screenshot-${index}`,
            contentType: "image/png",
            bytes: 3,
            sha256: "snapshot",
          },
        ],
      })),
    },
  })
  const result = await call("get_run", { kind: "playwright", id })
  expect(result.isError).not.toBe(true)
  expect(JSON.stringify(result).length).toBeLessThan(200000)
  expect(result.structuredContent).toMatchObject({
    kind: "playwright",
    id,
    state: "finished",
    outcome: "failed",
    failureCount: 1000,
    artifactCount: 1000,
    truncated: true,
    identity: { sourceDigest: "source-identity", appDigest: "app-identity" },
  })
  expect(result.structuredContent.failures).toHaveLength(20)
  expect(result.structuredContent.artifacts).toHaveLength(20)
  expect(result.structuredContent.artifacts[0].retrieval).toMatchObject({
    tool: "get_run_artifact",
    arguments: { id, artifactId },
  })
  expect(result.structuredContent.reviewPath).toContain(id)
  expect(result.structuredContent.evidence).toContainEqual(
    expect.objectContaining({
      tool: "get_run",
      arguments: { kind: "playwright", id, detail: "log" },
    }),
  )
})

test("Integration 명시적 종류는 실패 요약을 제한하고 id-only 호출의 기존 응답은 유지한다", async () => {
  const { call, services, id } = fixture()
  const run = {
    ...services.runs.get(),
    state: "finished",
    createdAt: "now",
    settings: { digest: "settings-digest", file: "settings.json", source: "private settings" },
    result: {
      outcome: "assertion_failed",
      errors: [],
      cases: Array.from({ length: 1000 }, () => ({
        file: "case.test.ts",
        name: "failure",
        errors: [{ message: "failure ".repeat(1250) }],
      })),
    },
  }
  services.runs.get.mockReturnValue(run)
  const summary = await call("get_run", { kind: "integration", id })
  expect(summary.isError).not.toBe(true)
  expect(JSON.stringify(summary).length).toBeLessThan(200000)
  expect(summary.structuredContent).toMatchObject({
    state: "finished",
    outcome: "assertion_failed",
    caseCount: 1000,
    failureCount: 1000,
    truncated: true,
    identity: { sourceDigest: "captured-digest", settingsDigest: "settings-digest" },
  })
  expect(summary.structuredContent.failures).toHaveLength(20)
  expect(summary.structuredContent).not.toHaveProperty("result")
  expect(JSON.stringify(summary.structuredContent)).not.toContain("private settings")
  const legacy = await call("get_run", { id })
  expect(legacy.structuredContent.id).toBe(id)
  expect(legacy.structuredContent.result.cases).toHaveLength(1000)
})

test("Unit 명시적 종류는 원시 명령 출력을 기본 결과에 복제하지 않는다", async () => {
  const { call, services, id } = fixture()
  services.unitTests.get.mockReturnValue({
    ...services.unitTests.get(),
    stdout: "output".repeat(100000),
    stderr: "error".repeat(100000),
  } as ReturnType<typeof services.unitTests.get>)
  const summary = await call("get_run", { kind: "unit", id })
  expect(summary.isError).not.toBe(true)
  expect(JSON.stringify(summary).length).toBeLessThan(10000)
  expect(summary.structuredContent).toMatchObject({
    kind: "unit",
    id,
    exitCode: 1,
    cleanup: { state: "removed" },
  })
  expect(summary.structuredContent).not.toHaveProperty("stdout")
  expect(summary.structuredContent.evidence).toContainEqual(
    expect.objectContaining({ tool: "get_run", arguments: { kind: "unit", id, detail: "log" } }),
  )
})
