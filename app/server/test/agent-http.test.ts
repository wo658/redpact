import { randomUUID } from "node:crypto"
import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

function fixture() {
  const id = randomUUID()
  const worktreeId = randomUUID()
  const view = {
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
  }
  const services = {
    settings: {},
    submissions: {},
    executeTests: {},
    runs: {
      listForWorktree: vi.fn(() => ({ items: [], nextCursor: null })),
    },
    reviews: { policy: vi.fn(() => "ask"), get: vi.fn(() => undefined) },
    executionReviews: {
      request: vi.fn(async () => view),
      get: vi.fn((key) => (key === id ? view : undefined)),
      capability: vi.fn(() => "private-ui-token"),
    },
    unitTests: { start: vi.fn() },
    captureWorkflow: { start: vi.fn() },
    worktrees: {
      observed: vi.fn(async () => ({ projectId: "project", worktreeId, disconnected: false })),
      connect: vi.fn(),
    },
  }
  const app = createApp(services as unknown as Services)
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  return { app, post, services, id, worktreeId }
}

test("CLI 실행 요청은 Ask 승인을 기다리고 실행하거나 UI 토큰을 반환하지 않는다", async () => {
  const { post, services, id } = fixture()
  const response = await post("/api/agent/tests", { kind: "unit", path: "/repo/feature" })
  expect(response.status).toBe(202)
  const body = await response.json()
  expect(body).toMatchObject({ id, kind: "unit", state: "awaiting_approval", executionId: null })
  expect(body.reviewPath).toContain(id)
  expect(JSON.stringify(body)).not.toContain("private-ui-token")
  expect(services.unitTests.start).not.toHaveBeenCalled()
  expect(services.executionReviews.capability).not.toHaveBeenCalled()
})

test("CLI 요청은 다른 종류의 옵션과 상대 경로를 거부한다", async () => {
  const { post, services } = fixture()
  for (const input of [
    { kind: "unit", path: "/repo", command: "echo unsafe" },
    { kind: "integration", path: "/repo", target: "functional" },
    { kind: "unit", path: "relative" },
  ]) {
    expect((await post("/api/agent/tests", input)).status).toBe(400)
  }
  expect(services.executionReviews.request).not.toHaveBeenCalled()
})

test("CLI 이력 조회는 프로젝트 등록 없이 기존 체크아웃의 커서를 유지한다", async () => {
  const { app, services, worktreeId } = fixture()
  const response = await app.request("/api/agent/runs?path=/repo/feature&kind=unit&before=cursor")
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ worktreeId, items: [], nextCursor: null })
  expect(services.runs.listForWorktree).toHaveBeenCalledWith(worktreeId, "cursor", "unit")
  expect(services.worktrees.connect).not.toHaveBeenCalled()
})

test("CLI 조회는 대기 검토 ID를 유지하고 승인·취소 API를 추가하지 않는다", async () => {
  const { app, post, id } = fixture()
  const result = await app.request(`/api/agent/runs/unit/${id}`)
  expect(result.status).toBe(200)
  expect(await result.json()).toMatchObject({ id, state: "awaiting_approval" })
  expect((await post(`/api/agent/runs/unit/${id}/approve`, {})).status).toBe(404)
  expect((await post(`/api/agent/runs/unit/${id}/cancel`, {})).status).toBe(404)
})

test("런타임 종료는 등록된 종료 workflow에만 요청한다", async () => {
  const { services } = fixture()
  const stop = vi.fn()
  const app = createApp({ ...services, runtimeControl: { stop } } as unknown as Services)
  const response = await app.request("/api/agent/runtime/stop", { method: "POST" })
  expect(response.status).toBe(202)
  expect(stop).toHaveBeenCalledOnce()
})

test("기록된 제출 재실행은 원래 제출 ID를 승인 workflow에 전달한다", async () => {
  const { services } = fixture()
  const submissionId = randomUUID()
  const reviewId = randomUUID()
  const submission = {
    id: submissionId,
    projectRoot: "/repo/feature",
    worktreeId: randomUUID(),
    files: [],
    digest: "captured",
    parsed: [],
    workItemId: "",
  }
  const view = {
    review: {
      id: reviewId,
      path: "/repo/feature",
      state: "pending",
      policy: "ask",
      revision: 0,
      createdAt: "now",
      selection: { services: ["app"] },
      settingsDigest: "settings",
      dependencies: {},
    },
    submission,
  }
  const start = vi.fn(async () => view)
  const app = createApp({
    ...services,
    submissions: { get: () => submission },
    reviews: { ...services.reviews, start, get: () => view },
  } as unknown as Services)
  const response = await app.request(`/api/agent/submissions/${submissionId}/run`, {
    method: "POST",
  })
  expect(response.status).toBe(202)
  expect(start).toHaveBeenCalledWith({ path: "/repo/feature", submissionId })
  expect(await response.json()).toMatchObject({ id: reviewId, state: "awaiting_approval" })
})

test("승인 대기 요청은 실행 로그나 산출물이 있는 것처럼 조회되지 않는다", async () => {
  const { app, id } = fixture()
  const response = await app.request(`/api/agent/runs/unit/${id}/logs`)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("Pending") })
})

test("Integration 검토 ID로 조회한 로그는 연결된 실제 실행 ID를 사용한다", async () => {
  const { services } = fixture()
  const reviewId = randomUUID()
  const runId = randomUUID()
  const copyLog = vi.fn(async () => ({ text: "recorded" }))
  const run = {
    id: runId,
    submissionId: randomUUID(),
    state: "finished",
    createdAt: "now",
    result: { outcome: "passed", cases: [], errors: [] },
    limitations: [],
  }
  const view = {
    review: {
      id: reviewId,
      path: "/repo/feature",
      state: "started",
      policy: "auto",
      revision: 0,
      createdAt: "now",
      selection: { services: ["app"] },
      settingsDigest: "settings",
      dependencies: {},
    },
    submission: { id: run.submissionId, files: [], parsed: [], digest: "source", workItemId: "" },
    run,
  }
  const app = createApp({
    ...services,
    runs: { ...services.runs, copyLog, get: () => run },
    submissions: { get: () => view.submission },
    reviews: { ...services.reviews, get: (id: string) => (id === reviewId ? view : undefined) },
  } as unknown as Services)
  const response = await app.request(`/api/agent/runs/integration/${reviewId}/logs`)
  expect(response.status).toBe(200)
  expect(copyLog).toHaveBeenCalledWith("integration", runId)
})
