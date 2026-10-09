import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
const { createApi, ApiError } = await server.ssrLoadModule("/src/lib/api.ts")

test("검토 조회는 정확한 실행 ID와 취소 신호를 유지하고 승인만 명시적으로 보낸다", async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json({})
  })
  const signal = new AbortController().signal
  await api.reviewContext("unit", "run/one", signal)
  await api.approveExecutionReview("unit", "run/one", 4)
  await api.cancelExecutionReview("unit", "run/one")
  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      "/api/review-context?kind=unit&id=run%2Fone",
      "/api/execution-reviews/unit/run%2Fone/approve",
      "/api/execution-reviews/unit/run%2Fone/cancel",
    ],
  )
  assert.equal(calls[0].init.method, "GET")
  assert.equal(calls[0].init.signal, signal)
  assert.deepEqual(JSON.parse(calls[1].init.body), { revision: 4 })
  assert.equal(calls[0].init.headers.Authorization, undefined)
})

test("승인 충돌과 HTTP 오류의 진단을 보존하고 HTML 응답을 거부한다", async () => {
  const detail = { error: "Reviewed inputs changed", code: "stale_review" }
  await assert.rejects(
    createApi(async () => Response.json(detail, { status: 409 })).approveExecutionReview(
      "unit",
      "r",
      1,
    ),
    (error) =>
      error instanceof ApiError && error.status === 409 && error.details.code === detail.code,
  )
  await assert.rejects(
    createApi(async () => new Response("Unauthorized", { status: 401 })).unitRun("r"),
    (error) => error.status === 401,
  )
  await assert.rejects(
    createApi(async () => new Response("<html>app shell</html>")).unitRun("r"),
    /invalid response/,
  )
})

test("실행 이력은 명시된 checkout과 페이지 커서를 사용하고 조회로 실행하지 않는다", async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json({ items: [] })
  })
  await api.executionLogs("w/one", "older")
  assert.equal(calls[0].url, "/api/runs?worktreeId=w%2Fone&before=older")
  assert.equal(calls[0].init.method, "GET")
  for (const name of [
    "projects",
    "connect",
    "start",
    "runPlaywright",
    "startUnitRun",
    "saveProjectConfiguration",
    "testContainerAction",
  ]) {
    assert.equal(api[name], undefined)
  }
})

test("임베디드 뷰어는 원문과 이미지 및 승인 요청을 capability 경로 안에 유지한다", async () => {
  const previous = globalThis.document
  globalThis.document = { querySelector: () => ({ getAttribute: () => "/session-capability/" }) }
  try {
    const calls = []
    const api = createApi(async (url, init) => {
      calls.push({ url, init })
      return Response.json({})
    })
    await api.reviewContext("unit", "r")
    await api.approveExecutionReview("unit", "r", 1)
    await api.captureSource("capture", "path/file.ts")
    assert.ok(calls.every(({ url }) => url.startsWith("/session-capability/api/")))
    assert.equal(
      api.captureArtifact("r", "after", "a"),
      "/session-capability/api/playwright-runs/r/after/artifacts/a",
    )
  } finally {
    globalThis.document = previous
  }
})
