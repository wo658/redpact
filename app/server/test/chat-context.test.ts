import { randomUUID } from "node:crypto"
import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

function fixture() {
  const id = randomUUID()
  const reviewId = randomUUID()
  const worktreeId = randomUUID()
  const projectId = randomUUID()
  const artifactId = randomUUID()
  const createdAt = "2026-10-09T00:00:00.000Z"
  const summary = {
    id,
    kind: "unit",
    intent: "pnpm test",
    state: "finished",
    outcome: "command_failed",
    createdAt,
    finishedAt: createdAt,
  }
  const settings = {
    projectRoot: "/repo/feature",
    rulesRoot: "/repo/main",
    read: vi.fn(async () => ({
      valid: true,
      file: "/repo/main/.redpact/settings.json",
      issues: [],
      digest: "settings-digest",
      source: "SECRET_SETTING",
      settings: { dependencies: { external: { env: { PASSWORD: "SECRET_SETTING" } } } },
    })),
  }
  const unit = {
    id,
    projectId,
    worktreeId,
    projectRoot: "/repo/feature",
    state: "finished",
    outcome: "command_failed",
    exitCode: 1,
    createdAt,
    finishedAt: createdAt,
    stdout: "SECRET_LOG",
    stderr: "SECRET_LOG",
    settings: { command: "pnpm test" },
    cleanup: { state: "failed", error: "Container removal failed" },
  }
  const integration = {
    id,
    submissionId: "submission",
    target: { projectId, worktreeId, projectRoot: "/repo/feature" },
    state: "finished",
    createdAt,
    finishedAt: createdAt,
    settings: { source: "SECRET_SETTING", digest: "settings-digest" },
    result: {
      outcome: "assertion_failed",
      cases: [
        {
          name: "retains value",
          file: "save.test.ts",
          state: "failed",
          errors: [{ name: "AssertionError", message: "expected saved value" }],
        },
      ],
      errors: [],
    },
    environment: { state: "stopped", errors: [] },
  }
  const capture = {
    target: "functional",
    id,
    projectId,
    worktreeId,
    projectRoot: "/repo/feature",
    state: "finished",
    outcome: "failed",
    createdAt,
    finishedAt: createdAt,
    settings: { secret: "SECRET_SETTING" },
    before: { state: "unavailable", cases: [] },
    after: {
      state: "finished",
      outcome: "failed",
      cases: [
        {
          title: "saves value",
          file: "save.spec.ts",
          status: "failed",
          errors: ["expected saved value"],
          steps: [],
          artifacts: [{ id: artifactId, name: "Saved state", contentType: "image/png", bytes: 3 }],
        },
      ],
    },
  }
  const services = {
    localFiles: { settings: vi.fn(async () => settings) },
    worktrees: {
      observed: vi.fn(async () => ({
        projectId,
        worktreeId,
        checkoutRoot: "/repo/feature",
        disconnected: false,
      })),
      connect: vi.fn(),
      ensure: vi.fn(),
      listProjects: vi.fn(),
      listWorktrees: vi.fn(),
    },
    runs: {
      listForWorktree: vi.fn(() => ({ items: [summary], nextCursor: "older" })),
      attentionForWorktree: vi.fn(() => ({
        active: [],
        cleanup: [summary],
        activeCount: 0,
        cleanupCount: 1,
      })),
      get: vi.fn(() => integration),
      copyLog: vi.fn(),
    },
    submissions: {
      get: vi.fn(() => ({
        id: "submission",
        projectId,
        worktreeId,
        projectRoot: "/repo/feature",
        files: [{ path: "save.test.ts", source: "SECRET_SOURCE" }],
      })),
    },
    unitTests: { get: vi.fn(() => unit), start: vi.fn() },
    captures: { get: vi.fn(() => capture) },
    reviews: {
      policy: vi.fn(() => "ask"),
      get: vi.fn(() => undefined),
      list: vi.fn(() => [
        {
          review: {
            id: reviewId,
            path: "/repo/feature",
            state: "pending",
            policy: "ask",
            createdAt,
            token: "SECRET_CAPABILITY",
          },
          submission: { projectId, worktreeId },
        },
      ]),
    },
    executionReviews: { get: vi.fn(() => undefined), list: vi.fn(() => []) },
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
    const message = await response.json()
    expect(message.result, JSON.stringify(message.error)).toBeDefined()
    return message.result
  }
  return { services, app, call, id, reviewId, worktreeId, projectId, artifactId }
}

test("현재 체크아웃의 설정·승인·실행 상태를 쓰기 없이 묶고 최신성은 별도로 표시한다", async () => {
  const { call, app, services, worktreeId, reviewId } = fixture()
  const result = await call("get_workspace_status", { path: "/repo/feature" })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).not.toHaveProperty("nextActions")
  expect(result.structuredContent).toMatchObject({
    projectRoot: "/repo/feature",
    rulesRoot: "/repo/main",
    observedBinding: { worktreeId },
    settings: { valid: true, digest: "settings-digest" },
    readiness: "not_checked",
    approval: { policy: "ask", pending: [{ id: reviewId, kind: "integration" }] },
    executions: { cleanupCount: 1 },
    freshness: { state: "unknown" },
    humanAcceptance: "not_recorded",
  })
  expect(JSON.stringify(result)).not.toContain("SECRET_")
  expect(services.worktrees.connect).not.toHaveBeenCalled()
  expect(services.worktrees.ensure).not.toHaveBeenCalled()
  expect(services.worktrees.listProjects).not.toHaveBeenCalled()
  expect(services.worktrees.listWorktrees).not.toHaveBeenCalled()
  expect(services.unitTests.start).not.toHaveBeenCalled()
  const response = await app.request("/api/workspace-status?path=%2Frepo%2Ffeature")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result.structuredContent)
})

test("관찰되지 않은 체크아웃은 빈 이력을 반환하며 상대 경로나 임의 쓰기 입력을 거부한다", async () => {
  const { call, services } = fixture()
  services.worktrees.observed.mockResolvedValue(null as never)
  services.reviews.list.mockReturnValue([])
  const result = await call("get_workspace_status", { path: "/repo/feature" })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({
    observedBinding: null,
    executions: { recent: [], active: [], cleanup: [], nextCursor: null },
  })
  expect(services.runs.listForWorktree).not.toHaveBeenCalled()
  expect((await call("get_workspace_status", { path: "relative" })).isError).toBe(true)
  expect(
    (await call("get_workspace_status", { path: "/repo/feature", approval: "auto" })).isError,
  ).toBe(true)
})

test("세 실행 종류의 실패와 불변 증거 참조를 같은 검토 주소로 연결한다", async () => {
  const { call, app, id, projectId, worktreeId, artifactId } = fixture()
  for (const kind of ["unit", "integration", "playwright"]) {
    const result = await call("get_review_context", { kind, id })
    expect(result.isError).not.toBe(true)
    const context = result.structuredContent
    expect(context).toMatchObject({
      id,
      executionId: id,
      kind,
      projectId,
      worktreeId,
      freshness: { state: "unknown" },
      humanAcceptance: "not_recorded",
    })
    const url = new URL(context.reviewPath, "http://localhost")
    expect(url.searchParams.get("page")).toBe("review")
    expect(url.searchParams.get("kind")).toBe(kind)
    expect(url.searchParams.get("id")).toBe(id)
    expect(url.searchParams.get("worktree")).toBe(worktreeId)
    expect(context.failures.length).toBeGreaterThan(0)
    expect(context.evidence).toContainEqual(
      expect.objectContaining({
        type: "log",
        tool: "get_execution",
        arguments: { kind, id, detail: "log" },
      }),
    )
    expect(JSON.stringify(context)).not.toContain("SECRET_")
    if (kind === "playwright") {
      expect(context.evidence).toContainEqual(
        expect.objectContaining({
          type: "image",
          arguments: { kind, id, detail: "image", artifactId, side: "after" },
        }),
      )
    }
    const response = await app.request(`/api/review-context?kind=${kind}&id=${id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(context)
  }
})

test("검토 요약은 많은 실패와 증거를 제한하고 전체 개수를 보존한다", async () => {
  const { call, services, id } = fixture()
  services.runs.get.mockReturnValue({
    ...services.runs.get(),
    result: {
      outcome: "assertion_failed",
      cases: Array.from({ length: 35 }, (_, index) => ({
        name: `case ${index}`,
        file: `case${index}.test.ts`,
        state: "failed",
        errors: [{ name: "AssertionError", message: "x".repeat(5000) }],
      })),
      errors: [],
    },
  })
  const result = await call("get_review_context", { kind: "integration", id })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.failures).toHaveLength(20)
  expect(result.structuredContent.failureCount).toBe(35)
  expect(result.structuredContent.failures[0].message.length).toBeLessThanOrEqual(2048)
})

test("승인 대기 검토는 실행 증거를 만들지 않고 화면 승인에 필요한 리비전만 노출한다", async () => {
  const { call, services, reviewId, worktreeId, projectId } = fixture()
  const review = {
    id: reviewId,
    kind: "unit",
    path: "/repo/feature",
    worktreeId,
    projectId,
    policy: "ask",
    state: "pending",
    revision: 2,
    createdAt: "2026-10-09",
    settingsDigest: "captured-settings",
    inputDigest: "captured-input",
    specification: { command: "pnpm test", cwd: ".", dockerfile: "unit.Dockerfile" },
    token: "SECRET_CAPABILITY",
  }
  services.executionReviews.get.mockReturnValue({ review } as never)
  const result = await call("get_review_context", { kind: "unit", id: reviewId })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({
    executionId: null,
    intent: "pnpm test",
    state: "pending",
    approval: { revision: 2, requestId: reviewId },
    cleanup: { state: "not_started" },
    evidence: [],
    evidenceCount: 0,
  })
  expect(JSON.stringify(result)).not.toContain("SECRET_CAPABILITY")
  expect(result.structuredContent.approval.preview).toMatchObject({
    settingsDigest: "captured-settings",
    inputDigest: "captured-input",
    command: "pnpm test",
    cwd: ".",
    dockerfile: "unit.Dockerfile",
  })
  expect(services.unitTests.get).not.toHaveBeenCalled()
  expect((await call("get_review_context", { kind: "playwright", id: reviewId })).isError).toBe(
    true,
  )
})

test("Integration 승인 미리보기는 저장된 서비스 선택을 제한하고 전체 개수를 보존한다", async () => {
  const { app, call, services, reviewId } = fixture()
  const selected = Array.from({ length: 60 }, (_, index) => `reviewed-app-${index}`)
  services.reviews.get.mockReturnValue({
    review: {
      id: reviewId,
      path: "/repo/feature",
      state: "pending",
      policy: "ask",
      revision: 1,
      createdAt: "2026-10-09T00:00:00Z",
      settingsDigest: "captured-settings",
      selection: { services: selected, select: {} },
      dependencies: {},
      environmentApproved: false,
      testsApproved: false,
      token: "SECRET_CAPABILITY",
    },
    submission: { ...services.submissions.get(), digest: "captured-source" },
  } as never)
  const result = await call("get_review_context", { kind: "integration", id: reviewId })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.approval.preview).toMatchObject({
    settingsDigest: "captured-settings",
    services: selected.slice(0, 50),
    serviceCount: 60,
    dependencies: [],
    dependencyCount: 0,
  })
  expect(JSON.stringify(result)).not.toContain("SECRET_")
  expect(services.localFiles.settings).not.toHaveBeenCalled()
  const response = await app.request(`/api/review-context?kind=integration&id=${reviewId}`)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result.structuredContent)
})

test("화면의 명시적 승인은 서버 내부 기능 키를 사용하고 오래된 리비전과 교차 출처를 거부한다", async () => {
  const { app, services, reviewId, worktreeId, projectId } = fixture()
  const review = {
    id: reviewId,
    kind: "unit",
    path: "/repo/feature",
    worktreeId,
    projectId,
    policy: "ask",
    state: "pending",
    revision: 2,
    createdAt: "2026-10-09",
    specification: { command: "pnpm test" },
  }
  services.executionReviews.get.mockReturnValue({ review } as never)
  const approve = vi.fn(async (input: { revision: number }) => {
    if (input.revision !== review.revision) {
      throw Object.assign(new Error("Review changed"), { code: "invalid_input" })
    }
    review.state = "started"
    return { review }
  })
  Object.assign(services.executionReviews, {
    capability: vi.fn(() => "SECRET_CAPABILITY"),
    approve,
    cancel: vi.fn(async () => {
      review.state = "cancelled"
      return { review }
    }),
  })
  const path = `/api/execution-reviews/unit/${reviewId}/approve`
  const headers = { "Content-Type": "application/json" }
  const stale = await app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify({ revision: 1 }),
  })
  expect(stale.status).toBe(400)
  const denied = await app.request(path, {
    method: "POST",
    headers: { ...headers, Origin: "https://other.example" },
    body: JSON.stringify({ revision: 2 }),
  })
  expect(denied.status).toBe(403)
  expect(approve).toHaveBeenCalledTimes(1)
  const accepted = await app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify({ revision: 2 }),
  })
  expect(accepted.status).toBe(200)
  expect(approve).toHaveBeenLastCalledWith({
    id: reviewId,
    revision: 2,
    token: "SECRET_CAPABILITY",
  })
  expect(await accepted.text()).not.toContain("SECRET_CAPABILITY")
  const cancelled = await app.request(`/api/execution-reviews/unit/${reviewId}/cancel`, {
    method: "POST",
  })
  expect(cancelled.status).toBe(200)
  expect((await cancelled.json()).approval.state).toBe("cancelled")
})

test("이력의 실제 실행 ID도 기존 취소·정리 재시도 워크플로로 연결한다", async () => {
  const { app, services, id } = fixture()
  const cancel = vi.fn(async () => services.unitTests.get())
  Object.assign(services.unitTests, { cancel })
  const response = await app.request(`/api/execution-reviews/unit/${id}/cancel`, { method: "POST" })
  expect(response.status).toBe(200)
  expect(cancel).toHaveBeenCalledWith(id)
  expect((await response.json()).executionId).toBe(id)
})

test("입력이 바뀐 승인 요청은 사용자에게 다시 요청할 이유를 보존한 충돌로 반환한다", async () => {
  const { app, services, reviewId } = fixture()
  services.executionReviews.get.mockReturnValue({ review: { kind: "unit" } } as never)
  Object.assign(services.executionReviews, {
    capability: () => "SECRET_CAPABILITY",
    approve: async () => {
      throw Object.assign(
        new Error("Execution inputs changed during review; request a new execution"),
        { code: "configuration_error" },
      )
    },
  })
  const response = await app.request(`/api/execution-reviews/unit/${reviewId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: 0 }),
  })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({
    code: "configuration_error",
    error: expect.stringContaining("request a new execution"),
  })
})

test("동일 체크아웃의 별칭 경로로 만든 승인도 관찰된 워크트리 ID로 찾는다", async () => {
  const { call, services, reviewId } = fixture()
  const requests = services.reviews.list()
  requests[0].review.path = "/repo/symlink-alias"
  services.reviews.list.mockReturnValue(requests)
  const result = await call("get_workspace_status", { path: "/repo/feature" })
  expect(result.structuredContent.approval.pending).toContainEqual(
    expect.objectContaining({ id: reviewId }),
  )
})

test("생성한 HTTP 명세는 사람의 승인에 필요한 리비전 본문을 설명한다", async () => {
  const { app } = fixture()
  const response = await app.request("/openapi.json")
  expect(response.status).toBe(200)
  const specification = await response.json()
  const request = specification.paths["/api/execution-reviews/{kind}/{id}/approve"].post.requestBody
  expect(request.required).toBe(true)
  expect(request.content["application/json"].schema.required).toContain("revision")
  expect(request.content["application/json"].schema.properties.subject.enum).toEqual([
    "environment",
    "tests",
  ])
})
