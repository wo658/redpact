import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createChangeWatcher } from "../src/adapters/changes/watch.js"
import { readHistory } from "../src/adapters/git/history.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createScheduler } from "../src/adapters/process/queue.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { eventScope } from "../src/workflows/event-scope.js"
import { createObserveProjects } from "../src/workflows/observe-projects.js"
import { createProjectGraph } from "../src/workflows/project-graph.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import {
  createTestApp as createApp,
  createTestExecution,
  type TestServices as Services,
} from "./helpers/execution.js"
import { managementHttp } from "./helpers/management-http.js"
import { createTestWorktrees as createWorktrees } from "./helpers/worktrees.js"

let directory: string
let repository: string
let linked: string
let storage: ReturnType<typeof openStore>
let services: Services & { worktrees: ReturnType<typeof createWorktrees> }
let app: ReturnType<typeof createApp>
const headers = { "Content-Type": "application/json" }

test("project management preserves identity and rejects implicit reconnection", async () => {
  const project = await services.worktrees.connect(repository, "Original")
  const renamed = await app.request(`/api/projects/${project.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "Renamed" }),
  })
  expect(renamed.status).toBe(200)
  expect(storage.store.getProject(project.id)?.name).toBe("Renamed")
  const disconnected = await app.request(`/api/projects/${project.id}`, { method: "DELETE" })
  expect(disconnected.status).toBe(200)
  expect(await services.worktrees.listProjects()).toEqual([])
  await expect(services.worktrees.connect(repository)).rejects.toMatchObject({
    code: "project_disconnected",
  })
  const restored = await app.request(`/api/projects/${project.id}/reconnect`, { method: "POST" })
  expect(restored.status).toBe(200)
  expect(await services.worktrees.connect(repository)).toMatchObject({
    id: project.id,
    name: "Renamed",
  })
})

test("disconnected projects survive restart, stop observation and preserve submissions", async () => {
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, repository)
  const work = await services.submissions.createWork("Retained evidence", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "example.test.ts", source: 'test("retained", () => {})' },
  ])
  await services.worktrees.disconnectProject(project.id)
  const readTests = vi.fn()
  const observe = createObserveProjects({
    worktrees: services.worktrees,
    submissions: services.submissions,
    files: { readTests } as never,
    checkouts: async () => [repository],
  })
  expect(await observe([repository])).toEqual({ watchPaths: [], issues: [] })
  expect(readTests).not.toHaveBeenCalled()
  expect(services.submissions.get(submission.id)).toMatchObject({
    id: submission.id,
    worktreeId: worktree.id,
  })
  await expect(services.worktrees.resolve(worktree.id)).rejects.toMatchObject({
    code: "project_disconnected",
  })
  await services.runs.close()
  storage.close()
  storage = openStore(join(directory, "state"))
  expect(storage.store.getProject(project.id)?.disconnectedAt).toBeTruthy()
  expect(storage.store.getSubmission(submission.id)?.worktreeId).toBe(worktree.id)
})

test("active project operations block disconnect without affecting another project", async () => {
  const active = new Set<string>()
  const worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
    activity: (id) => active.has(id),
  })
  const project = await worktrees.connect(repository)
  const other = await worktrees.connect(directory)
  active.add(project.id)
  await expect(worktrees.disconnectProject(project.id)).rejects.toMatchObject({
    code: "worktree_busy",
  })
  expect(worktrees.getProject(project.id).disconnectedAt).toBeUndefined()
  expect((await worktrees.disconnectProject(other.id)).disconnectedAt).toBeTruthy()
  active.clear()
  expect((await worktrees.disconnectProject(project.id)).disconnectedAt).toBeTruthy()
})

test("Git initialization cannot implicitly reconnect a disconnected directory", async () => {
  const root = join(directory, "later-git")
  await mkdir(root)
  const project = await services.worktrees.connect(root)
  await services.worktrees.disconnectProject(project.id)
  execFileSync("git", ["-C", root, "init", "-q"])
  await expect(services.worktrees.connect(root)).rejects.toMatchObject({
    code: "project_disconnected",
  })
  expect(storage.store.listProjects()).toHaveLength(1)
  expect((await services.worktrees.connect(root, undefined, true)).id).toBe(project.id)
  expect((await services.worktrees.listProjects())[0].location.kind).toBe("git")
})
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" }).trim()
}
async function request(path: string, body?: object) {
  return app.request(path, {
    headers,
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  })
}
async function operation(name: string, args: object) {
  if (!["configure", "get_run"].includes(name)) {
    return managementHttp(app, name, args)
  }
  const response = await app.request("/mcp", {
    method: "POST",
    headers: { ...headers, Host: "localhost", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  })
  expect(response.status).toBe(200)
  const message = await response.json()
  expect(message.error).toBeUndefined()
  return message.result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "redpact-worktrees-"))
  repository = join(directory, "repo")
  linked = join(directory, "linked")
  await mkdir(join(repository, ".redpact"), { recursive: true })
  await writeFile(
    join(repository, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "services": ["app"], "dependencies": {}, "tests": {"timeoutMs": 1234}}',
  )
  await writeFile(join(repository, "compose.yaml"), "services:\n  app:\n    image: example/app\n")
  git("init", "-q")
  git("add", ".")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "initial")
  git("worktree", "add", "-q", "--detach", linked)
  await writeFile(
    join(linked, ".redpact/settings.json"),
    '{"composeFiles": ["compose.yaml"], "services": ["app"], "dependencies": {}, "tests": {"timeoutMs": 2345}}',
  )
  storage = openStore(join(directory, "state"))
  const settings = createSettingsService(repository)
  const runner = {
    version: "test",
    execute: async () => ({ outcome: "passed" as const, cases: [], errors: [] }),
  }
  const worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  services = {
    worktrees,
    settings,
    submissions: createSubmissions({
      worktrees,
      store: storage.store,
      parse: parseSource,
      runnerVersion: runner.version,
    }),
    runs: createTestExecution({
      worktrees,
      store: storage.store,
      runner,
      scheduler: createScheduler(),
      settings,
    }),
  }
  app = createApp(services)
})
afterEach(async () => {
  await services.runs.close()
  storage.close()
  await rm(directory, { recursive: true, force: true })
})
async function connect() {
  const response = await request("/api/projects", { path: repository })
  expect(response.status).toBe(201)
  return response.json()
}

test("connects linked worktrees to one project and resolves shared settings through HTTP and MCP", async () => {
  const project = await connect()
  const a = await (
    await request(`/api/projects/${project.id}/worktrees`, { path: repository })
  ).json()
  const b = await (await request(`/api/projects/${project.id}/worktrees`, { path: linked })).json()
  expect(a.id).not.toBe(b.id)
  expect(a.projectId).toBe(project.id)
  expect(b.projectId).toBe(project.id)
  const repeated = await operation("attach_worktree", { projectId: project.id, path: linked })
  expect(repeated.structuredContent.id).toBe(b.id)
  const sameProject = await operation("connect_project", { path: linked })
  expect(sameProject.structuredContent.id).toBe(project.id)
  const av = await operation("configure", { action: "inspect", worktreeId: a.id })
  const bv = await operation("configure", { action: "inspect", worktreeId: b.id })
  expect(av.structuredContent.settings.tests.timeoutMs).toBe(1234)
  expect(bv.structuredContent.settings.tests.timeoutMs).toBe(1234)
  expect(bv.structuredContent.worktreeId).toBe(b.id)
  const http = await request(`/api/worktrees/${b.id}/settings`)
  expect((await http.json()).digest).toBe(bv.structuredContent.validation.digest)
})

test("binds work, submissions and runs to the selected worktree and preserves history after checkout removal", async () => {
  const project = await connect()
  const worktree = await (
    await request(`/api/projects/${project.id}/worktrees`, { path: linked })
  ).json()
  const work = await (
    await request("/api/work-items", {
      intent: "Verify linked checkout",
      worktreeId: worktree.id,
    })
  ).json()
  expect(work.projectId).toBe(project.id)
  expect(work.worktreeId).toBe(worktree.id)
  const submission = await (
    await request(`/api/work-items/${work.id}/submissions`, {
      files: [{ path: "x.test.ts", source: "" }],
    })
  ).json()
  expect(submission.worktreeId).toBe(worktree.id)
  const response = await request("/api/runs", { submissionId: submission.id })
  expect(response.status).toBe(202)
  const run = await response.json()
  await expect.poll(() => services.runs.get(run.id).state).toBe("finished")
  expect(services.runs.get(run.id).settings?.source).toContain("1234")
  expect(services.runs.get(run.id)).toMatchObject({
    target: {
      projectId: project.id,
      worktreeId: worktree.id,
      projectRoot: worktree.projectRoot,
    },
  })
  const environmentId = services.runs.get(run.id).environmentId
  if (!environmentId) {
    throw new Error("Missing prepared environment")
  }
  await services.runs.stopEnvironment(environmentId)
  await services.runs.stopEnvironment.idle()
  await rm(linked, { recursive: true })
  expect((await request(`/api/submissions/${submission.id}`)).status).toBe(200)
  expect((await request("/api/runs", { submissionId: submission.id })).status).toBe(409)
})

test("rejects unrelated repositories, uses project rules without local settings and retains bindings after restart", async () => {
  const project = await connect()
  const other = join(directory, "other")
  await mkdir(other)
  execFileSync("git", ["init", "-q", other])
  expect((await request(`/api/projects/${project.id}/worktrees`, { path: other })).status).toBe(409)
  await rm(join(linked, ".redpact"), { recursive: true })
  const response = await request(`/api/projects/${project.id}/worktrees`, { path: linked })
  expect(response.status).toBe(201)
  const worktree = await response.json()
  expect((await request(`/api/worktrees/${worktree.id}/settings`)).status).toBe(200)
  await services.runs.close()
  storage.close()
  storage = openStore(join(directory, "state"))
  // Reopening the file store must retain identities without rediscovering paths.
  expect(
    (storage.store as unknown as { getWorktree(id: string): unknown }).getWorktree(worktree.id),
  ).toMatchObject({ projectId: project.id })
})

test("requires an explicit target in multi-worktree mode and returns the same MCP error", async () => {
  expect((await request("/api/work-items", { intent: "Do not guess my checkout" })).status).toBe(
    409,
  )
  expect((await request("/api/settings")).status).toBe(409)
  const result = await operation("configure", { action: "validate" })
  expect(result.isError).toBe(true)
  expect(result.structuredContent.code).toBe("target_required")
  const description = await operation("configure", { action: "describe" })
  expect(description.isError).toBe(false)
  expect(description.structuredContent.projectRoot).toBeUndefined()
})

test("never invokes the queued runner after a checkout disappears", async () => {
  const project = await connect()
  const worktree = await (
    await request(`/api/projects/${project.id}/worktrees`, { path: linked })
  ).json()
  const work = await services.submissions.createWork("Preserve target", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  const jobs: (() => Promise<unknown>)[] = []
  let executed = false
  await services.runs.close()
  services.runs = createTestExecution({
    worktrees: services.worktrees,
    store: storage.store,
    settings: services.settings,
    runner: {
      version: "test",
      execute: async () => {
        executed = true
        return { outcome: "passed", cases: [], errors: [] }
      },
    },
    scheduler: {
      add: async (_key, task) => {
        jobs.push(task)
        return undefined as never
      },
      idle: async () => {},
    },
  })
  const run = await services.runs.start(submission.id)
  await rm(linked, { recursive: true })
  await jobs[0]()
  expect(executed).toBe(false)
  expect(services.runs.get(run.id).result?.outcome).toBe("configuration_error")
  expect(services.runs.get(run.id).target?.worktreeId).toBe(worktree.id)
  expect(services.runs.get(run.id).environmentId).toBeUndefined()
  expect(services.submissions.get(submission.id).id).toBe(submission.id)
})

test("distinguishes monorepo projects and deduplicates concurrent connections", async () => {
  await mkdir(join(repository, "apps/api"), { recursive: true })
  await mkdir(join(repository, "apps/web"), { recursive: true })
  await mkdir(join(linked, "apps/api"), { recursive: true })
  const [a, repeated, b] = await Promise.all([
    services.worktrees.connect(join(repository, "apps/api")),
    services.worktrees.connect(join(repository, "apps/api")),
    services.worktrees.connect(join(repository, "apps/web")),
  ])
  expect(a.id).toBe(repeated.id)
  expect(a.id).not.toBe(b.id)
  const worktree = await services.worktrees.ensure(a.id, linked)
  expect(worktree.projectRoot).toBe(
    join(await import("node:fs/promises").then(({ realpath }) => realpath(linked)), "apps/api"),
  )
})

test("rejects persisted run target mutation and corrupted parent references", async () => {
  const project = await connect()
  const worktree = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Keep evidence", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  const run = await services.runs.start(submission.id)
  await expect.poll(() => services.runs.get(run.id).state).toBe("finished")
  const final = services.runs.get(run.id)
  if (!final.target) {
    throw new Error("Missing run target")
  }
  expect(() =>
    storage.store.saveRun({
      ...final,
      target: { ...(final.target as NonNullable<typeof final.target>), projectRoot: repository },
    }),
  ).toThrow("target cannot change")
  const path = join(directory, "state/runs", run.id, "state.json")
  const { readFile } = await import("node:fs/promises")
  const record = JSON.parse(await readFile(path, "utf8"))
  record.data.target.worktreeId = "different"
  await writeFile(path, JSON.stringify(record))
  expect(() => storage.store.getRun(run.id)).toThrow(/target|environment/)
  await writeFile(path, JSON.stringify({ ...record, data: final }))
})

test.runIf(process.env.REDPACT_DOCKER_TESTS === "1")(
  "runs a real submitted Vitest test with the shared timeout and durable worktree target",
  async () => {
    const { createTestVitestRunner: createVitestRunner } = await import(
      "./helpers/container-runner.js"
    )
    const runner = createVitestRunner(join(directory, "state"))
    await services.runs.close()
    services.runs = createTestExecution({
      worktrees: services.worktrees,
      store: storage.store,
      settings: services.settings,
      runner,
      scheduler: createScheduler(),
    })
    services.submissions = createSubmissions({
      worktrees: services.worktrees,
      store: storage.store,
      parse: parseSource,
      runnerVersion: runner.version,
    })
    const project = await services.worktrees.connect(repository)
    const worktree = await services.worktrees.ensure(project.id, linked)
    const work = await services.submissions.createWork("Observe linked execution", worktree.id)
    const submission = await services.submissions.submitForWork(work.id, [
      {
        path: "example.test.ts",
        source:
          'import { test, expect } from "vitest"; test("observed assertion", () => expect(1).toBe(1))',
      },
    ])
    const run = await services.runs.start(submission.id)
    await expect.poll(() => services.runs.get(run.id).state, { timeout: 15000 }).toBe("finished")
    expect(services.runs.get(run.id).result?.outcome).toBe("passed")
    const { readFile } = await import("node:fs/promises")
    expect(
      await readFile(join(directory, "state/runs", run.id, "vitest.config.mjs"), "utf8"),
    ).toContain('"testTimeout":1234')
    expect(
      JSON.parse(await readFile(join(directory, "state/runs", run.id, "state.json"), "utf8")),
    ).toMatchObject({ version: 1, data: { target: { worktreeId: worktree.id } } })
  },
  20000,
)

test("rejects broken Git metadata instead of connecting it as a directory project", async () => {
  await writeFile(join(repository, ".git/HEAD"), "invalid-ref\n")
  const response = await request("/api/projects", { path: repository })
  expect(response.status).toBe(409)
})

test("work item creation requires a recorded worktree", () => {
  expect(() => services.submissions.createWorkItem("Explicit target")).toThrow(
    "Choose a worktreeId",
  )
})

test("canonical aliases and concurrent discovery retain one identity without changing source", async () => {
  const { realpath, readFile, symlink } = await import("node:fs/promises")
  const alias = join(directory, "alias")
  await symlink(linked, alias, "dir")
  const before = await readFile(join(linked, ".redpact/settings.json"), "utf8")
  const project = await services.worktrees.connect(repository)
  const [a, b] = await Promise.all([
    services.worktrees.ensure(project.id, linked),
    services.worktrees.ensure(project.id, alias),
  ])
  expect(a.id).toBe(b.id)
  expect(a.checkoutRoot).toBe(await realpath(linked))
  expect(a).not.toHaveProperty("origin")
  const reattached = await services.worktrees.ensure(project.id, alias)
  expect(reattached).toEqual(b)
  expect(await readFile(join(linked, ".redpact/settings.json"), "utf8")).toBe(before)
  expect(git("worktree", "list", "--porcelain")).toContain(linked)
})

test("monorepo attachment rejects symlink escapes and missing subprojects", async () => {
  const { symlink } = await import("node:fs/promises")
  await mkdir(join(repository, "apps/api"), { recursive: true })
  const project = await services.worktrees.connect(join(repository, "apps/api"))
  await expect(services.worktrees.ensure(project.id, linked)).rejects.toMatchObject({
    code: "worktree_unavailable",
  })
  await mkdir(join(linked, "apps"))
  const outside = join(directory, "outside")
  await mkdir(outside)
  await symlink(outside, join(linked, "apps/api"), "dir")
  await expect(services.worktrees.ensure(project.id, linked)).rejects.toMatchObject({
    code: "project_mismatch",
  })
  expect(storage.store.listWorktrees()).toEqual([])
})

test("branch changes keep identity but replacing a checkout with another repository invalidates it", async () => {
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, linked)
  execFileSync("git", ["-C", linked, "switch", "-c", "feature/identity"], { stdio: "pipe" })
  expect((await services.worktrees.resolve(worktree.id)).worktree.id).toBe(worktree.id)
  const { rename } = await import("node:fs/promises")
  await rename(linked, join(directory, "old-linked"))
  await mkdir(linked)
  execFileSync("git", ["init", "-q", linked])
  const http = await request(`/api/worktrees/${worktree.id}/settings`)
  expect(http.status).toBe(409)
  const result = await operation("configure", { action: "validate", worktreeId: worktree.id })
  expect(result.isError).toBe(true)
  expect(result.structuredContent.code).toBe((await http.json()).code)
  expect(services.worktrees.getWorktree(worktree.id)).toEqual(worktree)
})

test("directory projects accept only their root and never require Git to validate settings", async () => {
  const root = join(directory, "plain")
  const other = join(directory, "other-plain")
  await mkdir(root)
  await mkdir(other)
  const project = await services.worktrees.connect(root)
  expect(project.location.kind).toBe("directory")
  const worktree = await services.worktrees.ensure(project.id, root)
  expect(worktree.gitdir).toBeNull()
  await expect(services.worktrees.ensure(project.id, other)).rejects.toMatchObject({
    code: "project_mismatch",
  })
  const description = await operation("configure", { action: "describe", worktreeId: worktree.id })
  expect(description.structuredContent.projectRoot).toBe(worktree.projectRoot)
  expect(description.structuredContent.environment).toEqual({
    readiness: "not_checked",
    provisioning: "unsupported",
  })
  const response = await request(`/api/worktrees/${worktree.id}/settings`)
  expect(response.status).toBe(200)
  expect((await response.json()).valid).toBe(true)
})

test("submission target cannot be overridden by HTTP or MCP run inputs", async () => {
  const project = await services.worktrees.connect(repository)
  const a = await services.worktrees.ensure(project.id, repository)
  const b = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Keep submitted target", a.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  const response = await request("/api/runs", { submissionId: submission.id, worktreeId: b.id })
  expect(response.status).toBe(400)
  const result = await operation("run_tests", { submissionId: submission.id, worktreeId: b.id })
  expect(result.isError).toBe(true)
  expect(storage.store.unfinishedRuns()).toEqual([])
})

test("cancellation remains terminal when queued worktree resolution fails concurrently", async () => {
  const { vi } = await import("vitest")
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Cancellation precedence", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  const jobs: (() => Promise<unknown>)[] = []
  let executed = false
  await services.runs.close()
  services.runs = createTestExecution({
    store: storage.store,
    worktrees: services.worktrees,
    settings: services.settings,
    runner: {
      version: "test",
      execute: async () => {
        executed = true
        return { outcome: "passed", cases: [], errors: [] }
      },
    },
    scheduler: {
      add: (_key, task) =>
        new Promise((resolve, reject) => {
          jobs.push(() =>
            task().then(
              (value) => {
                resolve(value)
                return value
              },
              (error) => {
                reject(error)
                throw error
              },
            ),
          )
        }),
      idle: async () => {},
    },
  })
  const run = await services.runs.start(submission.id)
  let rejectPending: (error: Error) => void = () => {
    throw new Error("Pending resolution is not initialized")
  }
  const pending = new Promise<Awaited<ReturnType<typeof services.worktrees.resolve>>>(
    (_resolve, reject) => {
      rejectPending = reject
    },
  )
  const resolve = vi.spyOn(services.worktrees, "resolve").mockReturnValueOnce(pending)
  const executing = jobs[0]()
  expect(resolve).toHaveBeenCalled()
  services.runs.cancel(run.id)
  rejectPending(new Error("Checkout disappeared during resolution"))
  await executing
  resolve.mockRestore()
  expect(executed).toBe(false)
  expect(services.runs.get(run.id).result?.outcome).toBe("cancelled")
})

test("restart preserves immutable submissions and bound targets while interrupting unfinished runs", async () => {
  const { readFile } = await import("node:fs/promises")
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Durable target", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  const submissionPath = join(directory, "state/submissions", `${submission.id}.json`)
  const submissionBytes = await readFile(submissionPath)
  storage.store.saveRun({
    id: "interrupted-test",
    submissionId: submission.id,
    state: "running",
    result: null,
    target: {
      projectId: project.id,
      worktreeId: worktree.id,
      projectRoot: worktree.projectRoot,
      checkoutRoot: worktree.checkoutRoot,
    },
    createdAt: "now",
    finishedAt: null,
    limitations: [],
  })
  await services.runs.close()
  storage.close()
  storage = openStore(join(directory, "state"))
  const restored = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    settings: createSettingsService,
  })
  services.worktrees = restored
  services.runs = createTestExecution({
    store: storage.store,
    worktrees: restored,
    settings: services.settings,
    scheduler: createScheduler(),
    runner: {
      version: "test",
      execute: async () => {
        throw new Error("Must not restart a run")
      },
    },
  })
  expect(services.runs.get("interrupted-test")).toMatchObject({
    state: "finished",
    result: { outcome: "interrupted" },
    target: { worktreeId: worktree.id },
  })
  expect((await restored.ensure(project.id, linked)).id).toBe(worktree.id)
  expect(await readFile(submissionPath)).toEqual(submissionBytes)
})

test("store rejects cross-worktree parents and worktree identity mutation", async () => {
  const project = await services.worktrees.connect(repository)
  const a = await services.worktrees.ensure(project.id, repository)
  const b = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Immutable links", a.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "x.test.ts", source: "" },
  ])
  expect(() =>
    storage.store.createSubmission({ ...submission, id: "forged", worktreeId: b.id }),
  ).toThrow("binding")
  expect(() => storage.store.saveWorktree({ ...a, projectRoot: b.projectRoot })).toThrow("identity")
  expect(storage.store.getSubmission(submission.id)?.worktreeId).toBe(a.id)
  expect(storage.store.getSubmission("forged")).toBeUndefined()
})

test("preserves Worktree HTTP routes and configure identity", async () => {
  const project = await connect()
  const response = await request(`/api/projects/${project.id}/worktrees`, { path: linked })
  expect(response.status).toBe(201)
  const worktree = await response.json()
  const result = await operation("get_worktree", { id: worktree.id })
  expect(result.structuredContent.id).toBe(worktree.id)
  const configured = await operation("configure", { action: "inspect", worktreeId: worktree.id })
  expect(configured.structuredContent.worktreeId).toBe(worktree.id)
  expect(configured.structuredContent).not.toHaveProperty("workspaceId")
})

test("writes current Worktree records without transforming submitted source", async () => {
  const { readFile } = await import("node:fs/promises")
  const project = await connect()
  const worktree = await services.worktrees.ensure(project.id, linked)
  const work = await services.submissions.createWork("Preserve workspaceId in intent", worktree.id)
  const source = 'const fixture = { workspaceId: "original", worktreeId: "literal" }'
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "legacy.test.ts", source },
  ])
  const state = join(directory, "state")
  const paths = [
    join(state, "worktrees", `${worktree.id}.json`),
    join(state, "work-items", `${work.id}.json`),
    join(state, "submissions", `${submission.id}.json`),
  ]
  const bytes = await Promise.all(paths.map((path) => readFile(path, "utf8")))
  expect(JSON.parse(bytes[1]).data.worktreeId).toBe(worktree.id)
  expect(JSON.parse(bytes[2]).data.worktreeId).toBe(worktree.id)
  await services.runs.close()
  storage.close()
  storage = openStore(state)
  expect(storage.store.listWorktrees()).toEqual([worktree])
  expect(storage.store.getWorkItem(work.id)).toEqual(work)
  expect(storage.store.getSubmission(submission.id)).toEqual(submission)
  expect(storage.store.getSubmission(submission.id)?.files[0].source).toBe(source)
  expect(await Promise.all(paths.map((path) => readFile(path, "utf8")))).toEqual(bytes)
  const restored = storage.store.getWorktree(worktree.id)
  if (!restored) {
    throw new Error("Missing restored worktree")
  }
  storage.store.saveWorktree(restored)
  expect(await readFile(paths[0], "utf8")).toBe(bytes[0])
  const record = JSON.parse(bytes[1])
  record.data.workspaceId = "obsolete"
  await writeFile(paths[1], JSON.stringify(record))
  expect(() => storage.store.getWorkItem(work.id)).toThrow("Invalid persisted record")
})

test("HTTP discovers existing and newly created Git worktrees while preserving IDs", async () => {
  const project = await connect()
  await services.worktrees.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const initialResponse = await request(`/api/projects/${project.id}/worktrees`)
  expect(initialResponse.status).toBe(200)
  const initial = await initialResponse.json()
  expect(initial.map((w: { checkoutRoot: string }) => w.checkoutRoot).sort()).toEqual(
    (await Promise.all([repository, linked].map((path) => realpath(path)))).sort(),
  )
  const linkedRoot = await realpath(linked)
  const original = initial.find((w: { checkoutRoot: string }) => w.checkoutRoot === linkedRoot)
  const newer = join(directory, "new linked checkout")
  git("worktree", "add", "-q", "--detach", newer)
  const response = await request(`/api/projects/${project.id}/worktrees`)
  expect(response.status).toBe(200)
  const worktrees = await response.json()
  expect(worktrees).toHaveLength(3)
  expect(worktrees).toContainEqual(original)
  const [a, b] = await Promise.all([
    services.worktrees.listWorktrees(project.id),
    services.worktrees.listWorktrees(project.id),
  ])
  expect(a).toEqual(b)
  expect(a).toHaveLength(3)
  const newerRoot = await realpath(newer)
  await rm(newer, { recursive: true })
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(
    a.filter((item) => item.checkoutRoot !== newerRoot),
  )
  expect(storage.store.listWorktrees()).toEqual(expect.arrayContaining(a.map(withoutBranch)))
})

test("discovery skips missing subprojects and unavailable checkouts without losing valid worktrees", async () => {
  await mkdir(join(repository, "apps/api"), { recursive: true })
  const project = await services.worktrees.connect(join(repository, "apps/api"))
  const first = await services.worktrees.listWorktrees(project.id)
  expect(first).toHaveLength(1)
  expect(first[0].projectRoot).toBe(await realpath(join(repository, "apps/api")))
  await mkdir(join(linked, "apps/api"), { recursive: true })
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(2)
})

test("unconfigured tracking hides merged worktrees against the primary checkout branch", async () => {
  git("branch", "-m", "local")
  execFileSync("git", ["-C", linked, "restore", "."])
  const project = await services.worktrees.connect(linked)
  const tracking = await (await request(`/api/projects/${project.id}/tracking`)).json()
  expect(tracking.tracking).toEqual({ mainBranch: "local", hideMerged: true })
  const visible = await (await request(`/api/projects/${project.id}/worktrees`)).json()
  expect(visible.map((item: { checkoutRoot: string }) => item.checkoutRoot)).toEqual([
    await realpath(repository),
  ])
  expect(tracking).not.toHaveProperty("mainWorktreeId")
  expect(storage.store.getProject(project.id)?.tracking).toBeUndefined()
  await services.worktrees.setTracking(project.id, { mainBranch: "local", hideMerged: false })
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(2)
  expect((await services.worktrees.getTracking(project.id)).tracking.hideMerged).toBe(false)
})

test("unconfigured tracking keeps checkouts visible without a primary branch", async () => {
  git("checkout", "--detach")
  const project = await connect()
  expect((await services.worktrees.getTracking(project.id)).tracking).toEqual({
    mainBranch: null,
    hideMerged: false,
  })
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(2)
})

test("project tracking hides clean merged checkouts but preserves the main branch, dirty work, and history", async () => {
  git("branch", "-m", "main")
  execFileSync("git", ["-C", linked, "restore", "."])
  execFileSync("git", ["-C", linked, "switch", "-c", "feature/tracking"], { stdio: "pipe" })
  const project = await connect()
  await services.worktrees.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const original = await services.worktrees.listWorktrees(project.id)
  expect(original).toHaveLength(2)
  const linkedRoot = await realpath(linked)
  const target = original.find((w) => w.checkoutRoot === linkedRoot)
  if (!target) {
    throw new Error("Missing linked worktree")
  }
  const saved = await request(`/api/projects/${project.id}/tracking`, {
    mainBranch: "main",
    hideMerged: true,
  })
  expect(saved.status).toBe(200)
  expect(await (await request(`/api/projects/${project.id}/branches`)).json()).toContain("main")
  expect((await (await request(`/api/projects/${project.id}/tracking`)).json()).tracking).toEqual({
    mainBranch: "main",
    hideMerged: true,
  })
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(
    original.filter((w) => w.id !== target.id),
  )
  expect(storage.store.getWorktree(target.id)).toEqual(withoutBranch(target))
  await writeFile(join(linked, "uncommitted.txt"), "keep visible")
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(2)
  execFileSync("git", ["-C", linked, "add", "."])
  execFileSync("git", [
    "-C",
    linked,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "feature",
  ])
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(2)
  git("merge", "--ff-only", "feature/tracking")
  expect(await services.worktrees.listWorktrees(project.id)).toHaveLength(1)
  expect(JSON.parse(await readFile(join(repository, ".redpact/tracking.json"), "utf8"))).toEqual({
    mainBranch: "main",
    hideMerged: true,
  })
  expect(
    (
      await request(`/api/projects/${project.id}/tracking`, {
        mainBranch: "missing",
        hideMerged: true,
      })
    ).status,
  ).toBe(400)
  expect(
    (await request(`/api/projects/${project.id}/tracking`, { mainBranch: null, hideMerged: true }))
      .status,
  ).toBe(400)
  expect((await services.worktrees.getTracking(project.id)).tracking.mainBranch).toBe("main")
  const updated = await request(`/api/projects/${project.id}/tracking`, {
    mainBranch: "main",
    hideMerged: false,
  })
  expect(updated.status).toBe(200)
  expect((await (await request(`/api/projects/${project.id}/tracking`)).json()).tracking).toEqual({
    mainBranch: "main",
    hideMerged: false,
  })
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(original)
  storage.close()
  storage = openStore(join(directory, "state"))
  expect(JSON.parse(await readFile(join(repository, ".redpact/tracking.json"), "utf8"))).toEqual({
    mainBranch: "main",
    hideMerged: false,
  })
})

test("saved tracking remains readable when the primary checkout switches branches", async () => {
  git("branch", "-m", "main")
  const project = await connect()
  await services.worktrees.setTracking(project.id, { mainBranch: "main", hideMerged: false })
  git("switch", "-c", "other-at-same-commit")
  expect(await services.worktrees.getTracking(project.id)).toEqual({
    projectRoot: await realpath(repository),
    tracking: { mainBranch: "main", hideMerged: false },
  })
  expect(
    JSON.parse(await readFile(join(repository, ".redpact/tracking.json"), "utf8")).mainBranch,
  ).toBe("main")
})

test("live worktrees follow removal, restoration and Git moves without rewriting history", async () => {
  const project = await connect()
  await services.worktrees.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const initial = await services.worktrees.listWorktrees(project.id)
  const linkedRoot = await realpath(linked)
  const repositoryRoot = await realpath(repository)
  const target = initial.find((item) => item.checkoutRoot === linkedRoot)
  if (!target) {
    throw new Error("Missing linked worktree")
  }
  const work = await services.submissions.createWork("Retained evidence", target.id)
  const parked = join(directory, "parked")
  await rename(linked, parked)
  expect(await services.worktrees.checkoutPaths(project.id)).toContain(linkedRoot)
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(
    initial.filter((item) => item.id !== target.id),
  )
  expect(storage.store.getWorktree(target.id)).toEqual(withoutBranch(target))
  expect(storage.store.getWorkItem(work.id)).toEqual(work)
  await rename(parked, linked)
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(initial)
  git("worktree", "move", linked, parked)
  const moved = await services.worktrees.listWorktrees(project.id)
  expect(moved.map((item) => item.checkoutRoot).sort()).toEqual(
    [repositoryRoot, await realpath(parked)].sort(),
  )
  expect(storage.store.getWorktree(target.id)).toEqual(withoutBranch(target))
  git("worktree", "remove", "--force", parked)
  expect(
    (await services.worktrees.listWorktrees(project.id)).map((item) => item.checkoutRoot),
  ).toEqual([repositoryRoot])
  const replacement = join(directory, "replacement")
  git("worktree", "add", "-q", "--detach", replacement)
  git("worktree", "move", replacement, linked)
  const current = await services.worktrees.listWorktrees(project.id)
  expect(current.map((item) => item.checkoutRoot).sort()).toEqual(
    [repositoryRoot, linkedRoot].sort(),
  )
  expect(current.find((item) => item.checkoutRoot === linkedRoot)?.id).not.toBe(target.id)
  expect(storage.store.getWorktree(target.id)).toEqual(withoutBranch(target))
})

test("directory projects follow filesystem availability without storing a missing state", async () => {
  const root = join(directory, "plain")
  await mkdir(root)
  const project = await services.worktrees.connect(root)
  const target = await services.worktrees.ensure(project.id, root)
  await rm(root, { recursive: true })
  expect(await services.worktrees.listWorktrees(project.id)).toEqual([])
  expect(storage.store.getWorktree(target.id)).toEqual(withoutBranch(target))
  await mkdir(root)
  expect(await services.worktrees.listWorktrees(project.id)).toEqual([target])
})

test("unchanged attachment and discovery do not rewrite the identity registry", async () => {
  const project = await connect()
  const initial = await services.worktrees.listWorktrees(project.id)
  const save = vi.spyOn(storage.store, "saveWorktree")
  for (const item of initial) {
    expect(await services.worktrees.ensure(project.id, item.checkoutRoot)).toEqual(
      withoutBranch(item),
    )
  }
  expect(await services.worktrees.listWorktrees(project.id)).toEqual(initial)
  expect(save).not.toHaveBeenCalled()
})

test("project dependency catalog is independent of the selected worktree", async () => {
  const project = await connect()
  const rules = {
    payments: {
      kind: "mock",
      env: { app: { PAYMENT_MODE: "mock" } },
    },
  }
  await writeFile(
    join(repository, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: rules,
      services: ["app"],
    }),
  )
  const response = await request(`/api/projects/${project.id}/dependencies`)
  expect(response.status).toBe(200)
  const catalog = await response.json()
  expect(catalog.projectId).toBe(project.id)
  expect(catalog.file).toBe(await realpath(join(repository, ".redpact/settings.json")))
  expect(catalog.dependencies.payments.env.app.PAYMENT_MODE).toBe("mock")
  expect(catalog.worktreeId).toBeUndefined()
  await rm(join(repository, ".redpact/settings.json"))
  const missing = await request(`/api/projects/${project.id}/dependencies`)
  expect(missing.status).toBe(422)
  expect((await missing.json()).valid).toBe(false)
})

test("worktrees share all project settings and ignore retained checkout-local copies", async () => {
  const project = await connect()
  const worktree = await (
    await request(`/api/projects/${project.id}/worktrees`, { path: linked })
  ).json()
  await writeFile(
    join(repository, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: {
        payment: {
          kind: "mock",
          env: { app: { PAYMENT_MODE: "mock" } },
        },
      },
      tests: { timeoutMs: 1234 },
      services: ["app"],
    }),
  )
  const result = await operation("configure", {
    action: "inspect",
    worktreeId: worktree.id,
  })
  expect(result.structuredContent.validation.valid).toBe(true)
  expect(result.structuredContent.settings.tests.timeoutMs).toBe(1234)
  expect(result.structuredContent.settings.dependencies.payment.env.app.PAYMENT_MODE).toBe("mock")
  const firstDigest = result.structuredContent.validation.digest
  await writeFile(
    join(repository, ".redpact/settings.json"),
    JSON.stringify({
      composeFiles: ["compose.yaml"],
      dependencies: {
        payment: {
          kind: "mock",
          env: { app: { PAYMENT_MODE: "stub" } },
        },
      },
      services: ["app"],
    }),
  )
  const changed = await operation("configure", { action: "inspect", worktreeId: worktree.id })
  expect(changed.structuredContent.validation.digest).not.toBe(firstDigest)
  expect(changed.structuredContent.settings.dependencies.payment.env.app.PAYMENT_MODE).toBe("stub")
  await rm(join(repository, ".redpact/settings.json"))
  const missing = await request(`/api/worktrees/${worktree.id}/settings`)
  expect(missing.status).toBe(422)
})

test("tracking settings expose the primary project directory independently of worktree selection", async () => {
  const project = await connect()
  await services.worktrees.ensure(project.id, linked)
  const response = await request(`/api/projects/${project.id}/tracking`)
  expect(response.status).toBe(200)
  expect((await response.json()).projectRoot).toBe(await realpath(repository))
})

test("discovered worktrees need no setup and keep immutable identity through execution", async () => {
  const { readFile } = await import("node:fs/promises")
  const project = await connect()
  const items = await services.worktrees.listWorktrees(project.id)
  const linkedRoot = await realpath(linked)
  const worktree = items.find((item) => item.checkoutRoot === linkedRoot)
  expect(worktree).toBeDefined()
  if (!worktree) {
    throw new Error("Missing discovered worktree")
  }
  const path = join(directory, "state/worktrees", `${worktree.id}.json`)
  const bytes = await readFile(path, "utf8")
  const record = JSON.parse(bytes)
  expect(record.version).toBe(1)
  expect(record.data).not.toHaveProperty("attachment")
  expect(record.data).not.toHaveProperty("origin")

  await expect(services.worktrees.resolve(worktree.id)).resolves.toMatchObject({
    worktree: { id: worktree.id },
  })
  const resolved = await services.worktrees.resolve(worktree.id)
  expect(resolved.worktree).not.toHaveProperty("attachment")
  expect(resolved.worktree).not.toHaveProperty("origin")
  const work = await services.submissions.createWork("Automatic checkout", worktree.id)
  const submission = await services.submissions.submitForWork(work.id, [
    { path: "auto.test.ts", source: "" },
  ])
  const run = await services.runs.start(submission.id)
  await expect.poll(() => services.runs.get(run.id).state).toBe("finished")
  expect(services.runs.get(run.id).result?.outcome).toBe("passed")
  expect(await readFile(path, "utf8")).toBe(bytes)

  await rm(linked, { recursive: true })
  expect(await services.worktrees.listWorktrees(project.id)).not.toContainEqual(worktree)
  expect(services.submissions.get(submission.id).id).toBe(submission.id)
  expect(services.runs.get(run.id).target?.worktreeId).toBe(worktree.id)
  const environmentId = services.runs.get(run.id).environmentId
  if (!environmentId) {
    throw new Error("Missing prepared environment")
  }
  await services.runs.stopEnvironment(environmentId)
  await services.runs.stopEnvironment.idle()
  expect(await readFile(path, "utf8")).toBe(bytes)
})

test("directory projects are discovered automatically and manual detach is not an API", async () => {
  const root = join(directory, "plain-project")
  await mkdir(root)
  const project = await services.worktrees.connect(root)
  const worktrees = await services.worktrees.listWorktrees(project.id)
  expect(worktrees).toHaveLength(1)
  expect(worktrees[0].projectRoot).toBe(await realpath(root))
  expect(worktrees[0]).not.toHaveProperty("attachment")
  expect((await request(`/api/worktrees/${worktrees[0].id}/detach`, {})).status).toBe(404)
})

test("worktree listings read the current branch without changing stored identity", async () => {
  git("branch", "-m", "local")
  const project = await connect()
  const list = async () => (await request(`/api/projects/${project.id}/worktrees`)).json()
  const first = await list()
  const canonicalRepository = await realpath(repository)
  const canonicalLinked = await realpath(linked)
  const main = first.find(
    (item: { checkoutRoot: string }) => item.checkoutRoot === canonicalRepository,
  )
  expect(main.branch).toBe("local")
  expect(
    first.find((item: { checkoutRoot: string }) => item.checkoutRoot === canonicalLinked).branch,
  ).toBeNull()
  git("checkout", "-b", "next")
  const next = await list()
  expect(next.find((item: { id: string }) => item.id === main.id).branch).toBe("next")
  expect(storage.store.listWorktrees().find((item) => item.id === main.id)).not.toHaveProperty(
    "branch",
  )
})

function withoutBranch<T extends { branch?: string | null }>(value: T) {
  const { branch: _branch, ...identity } = value
  return identity
}

test("worktrees share fixed execution inputs and expose no selection API", async () => {
  const project = await connect()
  const a = await services.worktrees.ensure(project.id, repository)
  const b = await services.worktrees.ensure(project.id, linked)
  for (const item of [a, b]) {
    expect((await app.request(`/api/worktrees/${item.id}/selection`)).status).toBe(404)
    expect(
      (
        await app.request(`/api/worktrees/${item.id}/selection`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ services: ["app"], select: {} }),
        })
      ).status,
    ).toBe(404)
  }
  expect(await services.worktrees.getSelection(a.id)).toEqual(
    await services.worktrees.getSelection(b.id),
  )
})

test("tracking settings do not discover worktrees or inspect file changes", async () => {
  const adapter = createGitAdapter()
  const isolated = createWorktrees({
    store: storage.store,
    git: adapter,
    settings: createSettingsService,
  })
  const project = await isolated.connect(repository)
  await isolated.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const discover = vi
    .spyOn(adapter, "listWorktrees")
    .mockRejectedValue(new Error("Discovery unavailable"))
  const status = vi.spyOn(adapter, "inspect").mockRejectedValue(new Error("Status unavailable"))
  const branches = vi
    .spyOn(adapter, "listBranches")
    .mockRejectedValue(new Error("Branches unavailable"))
  const result = await isolated.getTracking(project.id).catch(() => null)
  expect(result).toEqual({
    projectRoot: await realpath(repository),
    tracking: { mainBranch: null, hideMerged: false },
  })
  expect(discover).not.toHaveBeenCalled()
  expect(branches).not.toHaveBeenCalled()
  expect(status).not.toHaveBeenCalled()
})

test("identity and shared settings resolution do not inspect file changes", async () => {
  const adapter = createGitAdapter()
  const status = vi.spyOn(adapter, "inspect")
  const isolated = createWorktrees({
    store: storage.store,
    git: adapter,
    settings: createSettingsService,
  })
  const project = await isolated.connect(repository)
  const worktree = await isolated.ensure(project.id, linked)
  const target = await isolated.resolve(worktree.id)
  expect((await target.settings.read()).valid).toBe(true)
  expect(status).not.toHaveBeenCalled()
})

test("tracking reads and writes do not wait for worktree admission", async () => {
  const project = await connect()
  const branch = git("branch", "--show-current")
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = services.worktrees.exclusive(async () => {
    entered()
    await new Promise<void>((resolve) => {
      release = resolve
    })
  })
  await ready
  try {
    const saved = await Promise.race([
      services.worktrees
        .setTracking(project.id, { mainBranch: branch, hideMerged: false })
        .then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ])
    expect(saved).toBe(true)
    expect((await services.worktrees.getTracking(project.id)).tracking.mainBranch).toBe(branch)
  } finally {
    release()
    await held
  }
})

test("agent-authored tracking and selections are read from project files", async () => {
  const project = await connect()
  const worktree = await services.worktrees.ensure(project.id, linked)
  await writeFile(
    join(repository, ".redpact/tracking.json"),
    JSON.stringify({ mainBranch: null, hideMerged: false }),
  )
  expect((await services.worktrees.getTracking(project.id)).tracking).toEqual({
    mainBranch: null,
    hideMerged: false,
  })
  const selection = { services: ["app"], select: {} }
  await writeFile(join(linked, ".redpact/selection.json"), JSON.stringify(selection))
  expect(await services.worktrees.getSelection(worktree.id)).toEqual(selection)
  expect(JSON.parse(await readFile(join(linked, ".redpact/selection.json"), "utf8"))).toEqual(
    selection,
  )
  expect(storage.store.getWorktreeSelection(worktree.id)).toBeUndefined()
  await writeFile(join(linked, ".redpact/selection.json"), '{"services": []}')
  expect(await services.worktrees.getSelection(worktree.id)).toEqual(selection)
})

test("tracking UI writes the primary project file without rewriting identity", async () => {
  const project = await connect()
  const record = join(directory, "state/projects", `${project.id}.json`)
  const original = await readFile(record, "utf8")
  const tracking = { mainBranch: git("branch", "--show-current"), hideMerged: false }
  await services.worktrees.setTracking(project.id, tracking)
  expect(await readFile(record, "utf8")).toBe(original)
  expect(JSON.parse(await readFile(join(repository, ".redpact/tracking.json"), "utf8"))).toEqual(
    tracking,
  )
})

test("retired execution preference records do not become project configuration", async () => {
  const project = await connect()
  const worktree = await services.worktrees.ensure(project.id, repository)
  storage.store.saveWorktreeSelection({
    id: worktree.id,
    selection: { services: ["missing"], select: {} },
    updatedAt: new Date().toISOString(),
  })
  expect(await services.worktrees.getSelection(worktree.id)).toEqual({
    services: ["app"],
    select: {},
  })
  await expect(readFile(join(repository, ".redpact/selection.json"))).rejects.toMatchObject({
    code: "ENOENT",
  })
})

test("a separate Redpact instance reads the same authored preferences", async () => {
  const project = await connect()
  const worktree = await services.worktrees.ensure(project.id, linked)
  const selection = { services: ["app"], select: {} }
  const tracking = { mainBranch: git("branch", "--show-current"), hideMerged: false }
  await services.worktrees.setTracking(project.id, tracking)
  const other = openStore(join(directory, "other-state"))
  try {
    const instance = createWorktrees({
      store: other.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const connected = await instance.connect(linked)
    const checkout = await instance.ensure(connected.id, linked)
    expect(checkout.id).not.toBe(worktree.id)
    expect(await instance.getSelection(checkout.id)).toEqual(selection)
    expect((await instance.getTracking(connected.id)).tracking).toEqual(tracking)
  } finally {
    other.close()
  }
})

test("worktree diff reads the configured primary branch and retains committed feature changes", async () => {
  git("branch", "local")
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, linked)
  await writeFile(
    join(repository, ".redpact/tracking.json"),
    JSON.stringify({ mainBranch: "local", hideMerged: false }),
  )
  await writeFile(join(linked, "feature.txt"), "committed feature\n")
  execFileSync("git", ["-C", linked, "add", "feature.txt"])
  execFileSync("git", [
    "-C",
    linked,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "feature",
  ])
  const response = await app.request(`/api/worktrees/${worktree.id}/git/diff`)
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.patch).toContain("+committed feature")
  expect(result.baseRevision).toBe(git("rev-parse", "local"))
  await writeFile(
    join(repository, ".redpact/tracking.json"),
    JSON.stringify({ mainBranch: "missing", hideMerged: false }),
  )
  const changed = await app.request(`/api/worktrees/${worktree.id}/git/diff`)
  expect(await changed.json()).toMatchObject({ available: false })
})

test("connection initializes missing primary settings and preserves authored files", async () => {
  const file = join(repository, ".redpact/settings.json")
  await rm(file)
  const project = await services.worktrees.connect(linked)
  const settings = await services.worktrees.projectSettings(project.id)
  expect((await settings.read()).valid).toBe(true)
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    composeFiles: [],
    services: [],
    dependencies: {},
    tests: { directory: "integration", timeoutMs: 10000, env: {} },
  })
  expect(
    JSON.parse(await readFile(join(linked, ".redpact/settings.json"), "utf8")).tests.timeoutMs,
  ).toBe(2345)
  const selected = await settings.read({ services: ["app"], select: {} })
  expect(selected.valid).toBe(true)
  expect(selected.plan).toBeUndefined()
  await writeFile(file, "invalid authored content")
  await services.worktrees.connect(repository)
  expect(await readFile(file, "utf8")).toBe("invalid authored content")
  await rm(file)
  await services.worktrees.connect(repository)
  expect((await settings.read()).valid).toBe(true)
})

test("image HTTP reads the configured merge base and validates paths before reading files", async () => {
  git("branch", "local")
  const project = await services.worktrees.connect(repository)
  const worktree = await services.worktrees.ensure(project.id, linked)
  await writeFile(
    join(repository, ".redpact/tracking.json"),
    JSON.stringify({ mainBranch: "local", hideMerged: false }),
  )
  const image = Buffer.from([255, 216, 0, 128])
  await writeFile(join(linked, "new image.jpg"), image)
  const response = await app.request(
    `/api/worktrees/${worktree.id}/git/image?${new URLSearchParams({ path: "new image.jpg" })}`,
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  expect(await response.json()).toEqual({
    baseRevision: git("rev-parse", "local"),
    before: null,
    after: { dataUrl: `data:image/jpeg;base64,${image.toString("base64")}` },
  })
  for (const path of [
    "../outside.png",
    "/outside.png",
    ".git/secret.png",
    "a/../secret.svg",
    "file.txt",
  ]) {
    const invalid = await app.request(
      `/api/worktrees/${worktree.id}/git/image?${new URLSearchParams({ path })}`,
    )
    expect(invalid.status).toBe(400)
  }
})

test("coalesces slow worktree discovery into one fresh follow-up", async () => {
  const adapter = createGitAdapter()
  const original = adapter.listWorktrees
  const entered = deferredRead()
  const release = deferredRead()
  const list = vi.spyOn(adapter, "listWorktrees").mockImplementation(async (path) => {
    const paths = await original(path)
    if (list.mock.calls.length === 1) {
      entered.resolve()
      await release.promise
    }
    return paths
  })
  const worktrees = createWorktrees({
    store: storage.store,
    git: adapter,
    settings: createSettingsService,
  })
  const project = await worktrees.connect(repository)
  await worktrees.setTracking(project.id, {
    mainBranch: git("branch", "--show-current"),
    hideMerged: false,
  })
  const first = worktrees.listWorktrees(project.id)
  await entered.promise
  const repeated = Array.from({ length: 20 }, () => worktrees.listWorktrees(project.id))
  const added = join(directory, "added")
  git("worktree", "add", "-q", "--detach", added)
  const addedRoot = await realpath(added)
  release.resolve()
  await first
  const results = await Promise.all(repeated)
  expect(list).toHaveBeenCalledTimes(2)
  expect(results.every((items) => items.some((item) => item.checkoutRoot === addedRoot))).toBe(true)
  await worktrees.listWorktrees(project.id)
  expect(list).toHaveBeenCalledTimes(3)
})

test("serializes and coalesces diff requests across resolved targets, then recovers after failure", async () => {
  const adapter = createGitAdapter()
  const entered = deferredRead()
  const release = deferredRead()
  let patch = "old"
  const diff = vi.spyOn(adapter, "diff").mockImplementation(async () => {
    const captured = patch
    if (diff.mock.calls.length === 1) {
      entered.resolve()
      await release.promise
    }
    return { available: true, patch: captured, omitted: [] }
  })
  const worktrees = createWorktrees({
    store: storage.store,
    git: adapter,
    settings: createSettingsService,
  })
  const project = await worktrees.connect(repository)
  const worktree = await worktrees.ensure(project.id, linked)
  const targets = await Promise.all(
    Array.from({ length: 21 }, () => worktrees.resolve(worktree.id)),
  )
  const first = targets[0].git.diff("all")
  await entered.promise
  const repeated = targets.slice(1).map((target) => target.git.diff("all"))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const activeCalls = diff.mock.calls.length
  patch = "new"
  release.resolve()
  expect((await first).patch).toBe("old")
  const results = await Promise.all(repeated)
  expect(activeCalls).toBe(1)
  expect(diff).toHaveBeenCalledTimes(2)
  expect(results.every((result) => result.patch === "new")).toBe(true)
  diff.mockRejectedValueOnce(new Error("temporary"))
  await expect(targets[0].git.diff("all")).rejects.toThrow("temporary")
  expect((await targets[0].git.diff("all")).patch).toBe("new")
})

function deferredRead() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("사이드바 표시 설정은 저장되고 작업 폴더 없는 브랜치도 읽을 수 있다", async () => {
  const project = await connect()
  const mainBranch = git("branch", "--show-current")
  git("branch", "already-merged")
  git("checkout", "-b", "branch-only")
  await writeFile(join(repository, "branch.txt"), "committed branch content\n")
  git("add", "branch.txt")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "branch change")
  git("checkout", mainBranch)
  await writeFile(join(repository, "unrelated.txt"), "uncommitted primary content")
  const saved = await request(`/api/projects/${project.id}/tracking`, {
    mainBranch,
    hideMerged: true,
    showBranches: true,
  })
  expect(saved.status).toBe(200)
  expect(
    (await (await request(`/api/projects/${project.id}/tracking`)).json()).tracking.showBranches,
  ).toBe(true)
  const response = await request(`/api/projects/${project.id}/branch-reviews`)
  expect(response.status).toBe(200)
  const branches = await response.json()
  expect(branches.map((b: { name: string }) => b.name)).toContain("branch-only")
  expect(branches.map((b: { name: string }) => b.name)).not.toContain("already-merged")
  expect(branches.find((b: { name: string }) => b.name === "branch-only").worktrees).toEqual([])
  const diff = await request(`/api/projects/${project.id}/branch-diff?branch=branch-only`)
  expect(diff.status).toBe(200)
  const body = await diff.json()
  expect(body.patch).toContain("+committed branch content")
  expect(body.patch).not.toContain("uncommitted primary content")
  expect(git("branch", "--show-current")).toBe(mainBranch)
  expect((await request(`/api/projects/${project.id}/branch-diff?branch=HEAD`)).status).toBe(404)
})

test("사라진 작업 폴더는 브랜치 목록에서 구분하며 조회로 다시 만들지 않는다", async () => {
  const project = await connect()
  git("worktree", "add", "-b", "missing-worktree", join(directory, "missing"))
  await rm(join(directory, "missing"), { recursive: true })
  await services.worktrees.setTracking(project.id, { mainBranch: null, hideMerged: false })
  const response = await request(`/api/projects/${project.id}/branch-reviews`)
  expect(response.status).toBe(200)
  const rows = await response.json()
  expect(rows.find((b: { name: string }) => b.name === "missing-worktree").worktrees).toEqual([
    { path: join(await realpath(directory), "missing"), missing: true },
  ])
  expect(
    (await services.worktrees.listWorktrees(project.id)).some(
      (w) => w.branch === "missing-worktree",
    ),
  ).toBe(false)
})

test("directory projects discover Git on listing and retain project and historical worktree identities", async () => {
  const root = join(directory, "later-git")
  await mkdir(root)
  const project = await services.worktrees.connect(root, "My project")
  const old = await services.worktrees.ensure(project.id, root)
  const oldRecord = await readFile(join(directory, "state/worktrees", `${old.id}.json`), "utf8")
  execFileSync("git", ["-C", root, "init", "-q"])
  const response = await request("/api/projects")
  const projects = await response.json()
  expect(projects).toEqual([
    {
      ...project,
      location: {
        kind: "git",
        commonGitdir: join(await realpath(root), ".git"),
        projectPath: ".",
      },
    },
  ])
  const current = await services.worktrees.listWorktrees(project.id)
  expect(current).toHaveLength(1)
  expect(current[0].id).not.toBe(old.id)
  expect(current[0].gitdir).toBe(join(await realpath(root), ".git"))
  expect(await readFile(join(directory, "state/worktrees", `${old.id}.json`), "utf8")).toBe(
    oldRecord,
  )
  expect((await services.worktrees.connect(root)).id).toBe(project.id)
  storage.close()
  storage = openStore(join(directory, "state"))
  expect(storage.store.getProject(project.id)?.location.kind).toBe("git")
})

test("reconnecting after Git initialization upgrades the same directory project", async () => {
  const root = join(directory, "reconnect-git")
  await mkdir(root)
  const project = await services.worktrees.connect(root, "Keep name")
  execFileSync("git", ["-C", root, "init", "-q"])
  const connected = await services.worktrees.connect(root)
  expect(connected.id).toBe(project.id)
  expect(connected.name).toBe("Keep name")
  expect(connected.location.kind).toBe("git")
  expect(storage.store.listProjects()).toHaveLength(1)
})

test("invalid or missing Git metadata does not hide directory projects or downgrade Git projects", async () => {
  const root = join(directory, "broken-git")
  await mkdir(root)
  const project = await services.worktrees.connect(root)
  await writeFile(join(root, ".git"), "invalid metadata")
  expect(await (await request("/api/projects")).json()).toContainEqual(project)
  const existing = await connect()
  await rename(join(repository, ".git"), join(repository, ".git-away"))
  expect(await (await request("/api/projects")).json()).toContainEqual(existing)
})

test("an open directory project observes git init and exposes committed graph history", async () => {
  const root = join(directory, "live-git")
  await mkdir(root)
  const project = await services.worktrees.connect(root)
  const scopeServices = {
    ...services,
    executeTests: services.runs,
    dataDirectory: join(directory, "state"),
  }
  const scope = await eventScope(scopeServices, { projectId: project.id })
  const watcher = createChangeWatcher()
  const changed = vi.fn()
  const failed = vi.fn()
  const subscription = watcher.subscribe(scope.roots, changed, failed)
  try {
    await subscription.ready
    execFileSync("git", ["-C", root, "init", "-q"])
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-qm",
      "First commit",
    ])
    await expect.poll(() => changed.mock.calls.length, { timeout: 5000 }).toBeGreaterThan(0)
    await eventScope(scopeServices, { projectId: project.id })
    expect(services.worktrees.getProject(project.id).location.kind).toBe("git")
    const graph = createProjectGraph({
      image: async () => ({ before: null, after: null }),
      fetch: async () => ({ remotes: [] }),
      store: storage.store,
      read: readHistory,
      diff: async () => ({ available: false, reason: "Unused", patch: "", omitted: [] }),
    })
    expect((await graph.history(project.id, { limit: 20 })).commits[0].message).toBe("First commit")
    expect(failed).not.toHaveBeenCalled()
  } finally {
    await subscription.close()
    await watcher.close()
  }
})

test("Git promotion keeps nested project paths and refuses unrelated identity changes", async () => {
  const root = join(directory, "nested-git")
  const child = join(root, "app")
  await mkdir(child, { recursive: true })
  const project = await services.worktrees.connect(child)
  execFileSync("git", ["-C", root, "init", "-q"])
  const [promoted] = await services.worktrees.listProjects()
  expect(promoted).toMatchObject({ id: project.id, location: { kind: "git", projectPath: "app" } })
  expect(await services.worktrees.connect(child)).toEqual(promoted)
  expect(() => storage.store.promoteProject({ ...promoted, name: "Renamed" })).toThrow()
  expect(() => storage.store.updateProject({ ...promoted, location: project.location })).toThrow()
})

test("project execution has no independent defaults API", async () => {
  const project = await services.worktrees.connect(repository)
  const url = `/api/projects/${project.id}/integration-defaults`
  expect((await app.request(url)).status).toBe(404)
  expect(
    (
      await app.request(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ services: ["app"], select: {} }),
      })
    ).status,
  ).toBe(404)
  await expect(
    readFile(join(repository, ".redpact/integration-defaults.json")),
  ).rejects.toMatchObject({ code: "ENOENT" })
})
