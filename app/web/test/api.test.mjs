import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
const { createApi, ApiError } = await server.ssrLoadModule("/src/lib/api.ts")

test("worktree actions use explicit parent IDs and preserve the creation request on retry", async () => {
  const calls = []
  const result = { requestId: "request-one", worktreeId: "worktree-one", workItemId: "work-one" }
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json(result)
  })
  await api.connect("/repo", "Project")
  const input = {
    requestId: "request-one",
    projectId: "project-one",
    intent: "Change",
    baseRef: "HEAD",
    branch: "codex/change",
    path: "/new",
  }
  assert.deepEqual(await api.start(input), result)
  await api.start(input)
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/api/projects", "/api/work-starts", "/api/work-starts"],
  )
  assert.equal(calls[1].init.body, calls[2].init.body)
  assert.equal(calls[0].init.headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(calls[0].init.body), { path: "/repo", name: "Project" })
})

test("HTTP errors, domain conflicts, and recovery diagnostics survive error handling", async () => {
  const detail = {
    code: "work_start_incomplete",
    error: "Creation uncertain",
    recovery: { state: "attempted", nextStep: "Inspect the checkout before continuing." },
  }
  const api = createApi(async () => Response.json(detail, { status: 409 }))
  await assert.rejects(
    api.start({}),
    (error) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.details.recovery.nextStep === detail.recovery.nextStep,
  )
  await assert.rejects(
    createApi(async () => new Response("Unauthorized", { status: 401 })).projects(),
    (error) => error.status === 401,
  )
})

test("reads carry abort signals and reject HTML responses from a misconfigured proxy", async () => {
  const signal = new AbortController().signal
  const api = createApi(async (_url, init) => {
    assert.equal(init.signal, signal)
    return new Response("<html>app shell</html>")
  })
  await assert.rejects(api.worktrees("project", signal), /invalid response/)
})

test("dependency reads preserve structured 422 diagnostics and explicit worktree identity", async () => {
  const diagnostics = {
    valid: false,
    file: ".redpact/settings.json",
    issues: [{ code: "missing", path: "", message: "Settings missing" }],
    worktreeId: "w/1",
    projectId: "p1",
  }
  const signal = new AbortController().signal
  const api = createApi(async (url, init) => {
    assert.equal(url, "/api/projects/w%2F1/dependencies")
    assert.equal(init.method, "GET")
    assert.equal(init.signal, signal)
    return Response.json(diagnostics, { status: 422 })
  })
  assert.equal(typeof api.projectDependencies, "function", "the viewer reads the project catalog")
  assert.deepEqual(await api.projectDependencies("w/1", signal), diagnostics)
  await assert.rejects(
    createApi(async () =>
      Response.json({ error: "Bad input" }, { status: 422 }),
    ).projectDependencies("w1"),
    (error) => error instanceof ApiError,
  )
})

test("viewer source contains no manual refresh actions or periodic data polling", async () => {
  const { readFile } = await import("node:fs/promises")
  for (const name of [
    "project-manager",
    "dependency-viewer",
    "worktree-review",
    "test-observation",
  ]) {
    const source = await readFile(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8")
    assert.doesNotMatch(
      source,
      /Refresh dependencies|Refresh changes|Refresh projects|t\("Refresh"\)|setInterval\(|setTimeout\(/,
      name,
    )
  }
})

test("통합 실행은 파일 필터 없이 제출 ID를 기존 실행 API에 보낸다", async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return Response.json({ id: "r", state: "queued" }, { status: 202 })
  })
  assert.equal((await api.startRun("submission-id")).state, "queued")
  assert.equal(calls[0].url, "/api/runs")
  assert.equal(calls[0].init.method, "POST")
  assert.deepEqual(JSON.parse(calls[0].init.body), { submissionId: "submission-id" })
})
