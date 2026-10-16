import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { openStore } from "../src/adapters/storage/files.js"
import { createApp } from "../src/app.js"

const restored = [
  ["GET", "/worktrees/w/merge"],
  ["GET", "/worktrees/w/pull-request"],
  ["GET", "/instance/github"],
  ["GET", "/projects/p/git/graph"],
  ["POST", "/projects/p/git/fetch"],
  ["GET", "/work-starts/request"],
  ["GET", "/projects/p/files?path=README.md"],
  ["POST", "/projects/p/test-container/start"],
  ["POST", "/dialogs/directory"],
  ["PATCH", "/projects/p"],
  ["DELETE", "/projects/p"],
  ["POST", "/projects/p/reconnect"],
  ["PUT", "/projects/p/configuration"],
  ["PUT", "/instance/settings"],
  ["POST", "/projects/p/tracking"],
  ["GET", "/plugin-updates"],
] as const

test.each(restored)("전체 앱의 관리 API를 복원한다: %s %s", async (method, path) => {
  const invoke = vi.fn(() => ({}))
  const service = new Proxy({}, { get: () => invoke })
  const app = createApp({
    merges: service,
    pullRequests: service,
    projectGraph: service,
    workStarts: service,
    projectFiles: service,
    testContainer: service,
    directoryPicker: service,
    worktrees: service,
    settingsEditor: service,
    projectSettings: service,
    pluginUpdates: service,
  } as never)
  let body: object = { name: "renamed" }
  if (path.endsWith("/tracking")) {
    body = { mainBranch: "main", hideMerged: false }
  }
  if (path.endsWith("/settings") || path.endsWith("/configuration")) {
    body = { source: "{}", revision: null }
  }
  const response = await app.request(`/api${path}`, {
    method,
    ...(method === "GET"
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
  expect(response.status).toBe(path.endsWith("/test-container/start") ? 202 : 200)
  expect(invoke).toHaveBeenCalled()
})

test("기존 실행과 수동 환경은 관리 화면 복원 후에도 조회하고 정리할 수 있다", async () => {
  const stopEnvironment = vi.fn(async () => ({ id: "old-manual", state: "stopped" }))
  const app = createApp({
    environments: {
      get: () => ({ id: "old-manual", lifecycle: "manual", state: "stop_failed" }),
      refresh: () => ({ id: "old-manual", lifecycle: "manual", state: "stop_failed" }),
    },
    stopEnvironment,
    runs: { get: () => ({ id: "retained-run", state: "finished" }) },
  } as never)
  expect((await app.request("/api/runs/retained-run")).status).toBe(200)
  expect((await app.request("/api/environments/old-manual")).status).toBe(200)
  expect((await app.request("/api/environments/old-manual/stop", { method: "POST" })).status).toBe(
    202,
  )
  expect(stopEnvironment).toHaveBeenCalledWith("old-manual")
})

test("기존 worktree 생성 기록은 다시 시작해도 변경하지 않고 읽는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-retained-start-"))
  const id = randomUUID()
  const record = {
    id,
    input: {
      requestId: id,
      projectId: randomUUID(),
      intent: "보존된 생성 요청",
      baseRef: "main",
      branch: "feature/retained",
      path: join(root, "checkout"),
    },
    checkoutRoot: join(root, "checkout"),
    revision: "a".repeat(40),
    worktreeId: randomUUID(),
    workItemId: randomUUID(),
    createdAt: "2026-10-09T00:00:00Z",
    state: "attempted",
  }
  try {
    await mkdir(join(root, "work-starts"))
    const file = join(root, "work-starts", `${id}.json`)
    const source = JSON.stringify({ version: 1, data: record })
    await writeFile(file, source)
    for (let restart = 0; restart < 2; restart++) {
      const runtime = openStore(root)
      expect(runtime.store.getWorkStart(id)).toEqual(record)
      runtime.close()
      expect(await readFile(file, "utf8")).toBe(source)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
