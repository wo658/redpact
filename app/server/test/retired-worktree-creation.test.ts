import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createApp } from "../src/app.js"
import type { WorkStart } from "../src/core/types/start-work.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

let directory: string
let repository: string
let storage: ReturnType<typeof openStore>
let worktrees: ReturnType<typeof createTestWorktrees>
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" }).trim()
}
function app() {
  return createApp({
    worktrees,
    workStarts: worktrees.workStarts,
    settings: createSettingsService(repository),
  } as never)
}
function reopen() {
  storage = openStore(join(directory, "state"))
  worktrees = createTestWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), "redpact-retired-creation-")))
  repository = join(directory, "repo")
  await mkdir(repository)
  await writeFile(join(repository, "source.txt"), "preserved source\n")
  git("init", "-q")
  git("add", ".")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "initial")
  reopen()
})
afterEach(async () => {
  storage.close()
  await rm(directory, { recursive: true, force: true })
})
async function retained(state: WorkStart["state"]) {
  const project = await worktrees.connect(repository)
  await worktrees.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const id = randomUUID()
  const record: WorkStart = {
    id,
    input: {
      requestId: id,
      projectId: project.id,
      intent: "보존할 생성 기록",
      baseRef: "HEAD",
      branch: `feature/${id}`,
      path: join(directory, id),
    },
    checkoutRoot: join(directory, id),
    revision: git("rev-parse", "HEAD"),
    worktreeId: randomUUID(),
    workItemId: randomUUID(),
    createdAt: "2026-10-01T00:00:00Z",
    state,
  }
  const path = join(directory, "state/work-starts", `${id}.json`)
  const bytes = JSON.stringify({ version: 1, data: record })
  await mkdir(join(directory, "state/work-starts"), { recursive: true })
  await writeFile(path, bytes)
  return { project, record, path, bytes }
}

test("생성 POST는 제거되고 브랜치와 checkout을 만들지 않는다", async () => {
  const { record } = await retained("prepared")
  const response = await app().request("/api/work-starts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record.input),
  })
  expect(response.status).toBe(404)
  expect(existsSync(record.checkoutRoot)).toBe(false)
  expect(git("branch", "--list", record.input.branch)).toBe("")
  const schema = await (await app().request("/openapi.json")).json()
  expect(schema.paths["/api/work-starts"]?.post).toBeUndefined()
  expect(schema.paths["/api/work-starts/{id}"].get).toBeDefined()
})

test.each(["prepared", "attempted", "created", "completed"] as const)(
  "과거 %s 기록은 재시작 후에도 원본 그대로 조회하며 누락된 기록은 404로 응답한다",
  async (state) => {
    const { record, path, bytes } = await retained(state)
    for (let i = 0; i < 2; i++) {
      storage.close()
      reopen()
      const response = await app().request(`/api/work-starts/${record.id}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(record)
      expect(await readFile(path, "utf8")).toBe(bytes)
    }
    expect((await app().request(`/api/work-starts/${randomUUID()}`)).status).toBe(404)
  },
)

test.each(["prepared", "attempted", "created"] as const)(
  "미완료 %s 기록이 있어도 호스트 checkout 발견·연결·연결 해제가 가능하고 원본은 보존된다",
  async (state) => {
    const { project, record, path, bytes } = await retained(state)
    git("worktree", "add", "-b", record.input.branch, record.checkoutRoot, record.revision)
    const discovered = await worktrees.listWorktrees(project.id)
    const found = discovered.find((item) => item.checkoutRoot === record.checkoutRoot)
    expect(found).toBeDefined()
    const response = await app().request(`/api/projects/${project.id}/worktrees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: record.checkoutRoot }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      id: found?.id,
      checkoutRoot: record.checkoutRoot,
    })
    const disconnect = await app().request(`/api/projects/${project.id}`, { method: "DELETE" })
    expect(disconnect.status).toBe(200)
    expect((await disconnect.json()).disconnectedAt).toBeTruthy()
    expect(await readFile(path, "utf8")).toBe(bytes)
    expect(await readFile(join(record.checkoutRoot, "source.txt"), "utf8")).toBe(
      "preserved source\n",
    )
    expect(git("branch", "--list", record.input.branch)).toContain(record.input.branch)
  },
)
