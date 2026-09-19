import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createWorktreeAdapter } from "../src/adapters/git/worktrees.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestApp as createApp, createTestExecution } from "./helpers/execution.js"
import { managementHttp } from "./helpers/management-http.js"
import { createTestWorktrees as createWorktrees } from "./helpers/worktrees.js"

let directory: string
let repository: string
let storage: ReturnType<typeof openStore>
let worktrees: ReturnType<typeof createWorktrees>
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" }).trim()
}
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), "redpact-start-")))
  repository = join(directory, "repo")
  await mkdir(join(repository, "apps/api"), { recursive: true })
  await writeFile(join(repository, "apps/api/source.ts"), "export const value = 1\n")
  git("init", "-q")
  git("add", ".")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "initial")
  storage = openStore(join(directory, "state"))
  worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    worktrees: createWorktreeAdapter(),
    settings: createSettingsService,
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  storage.close()
  await rm(directory, { recursive: true, force: true })
})

// Managed creation remains available through HTTP; agents use native Git.
test("HTTP work-start creates a linked worktree, project binding and work item in one call", async () => {
  const project = await worktrees.connect(join(repository, "apps/api"))
  const settings = createSettingsService(repository)
  const runs = createTestExecution({
    store: storage.store,
    settings,
    runner: {
      version: "test",
      execute: async () => ({ outcome: "passed", cases: [], errors: [] }),
    },
    scheduler: { add: async () => undefined as never, idle: async () => {} },
  })
  const submissions = createSubmissions({
    store: storage.store,
    worktrees,
    parse: () => ({ scenarios: [], limitations: [] }),
    runnerVersion: "test",
  })
  const app = createApp({ worktrees, settings, runs, submissions })

  const result = await managementHttp(app, "start_work", {
    requestId: randomUUID(),
    projectId: project.id,
    intent: "Implement new feature",
    baseRef: "HEAD",
    branch: "codex/feature",
    path: join(directory, "new"),
  })
  expect(result).toBeDefined()
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({
    projectId: project.id,
    projectRoot: join(directory, "new/apps/api"),
    checkoutRoot: join(directory, "new"),
  })
  const value = result.structuredContent
  expect(storage.store.getWorkItem(value.workItemId)).toMatchObject({
    worktreeId: value.worktreeId,
    intent: "Implement new feature",
  })
  expect(storage.store.getWorkStart(value.requestId)?.worktreeId).toBe(value.worktreeId)
  expect(value.configure).toEqual({
    tool: "configure",
    arguments: { action: "describe", worktreeId: value.worktreeId },
  })
  expect(git("worktree", "list", "--porcelain")).toContain(`worktree ${join(directory, "new")}`)
  expect(await readFile(join(value.projectRoot, "source.ts"), "utf8")).toContain("value = 1")
  expect(existsSync(join(value.projectRoot, ".redpact/settings.json"))).toBe(false)
  await runs.close()
})

async function input(overrides = {}) {
  const project = await worktrees.connect(join(repository, "apps/api"))
  return {
    requestId: randomUUID(),
    projectId: project.id,
    intent: "Implement feature",
    baseRef: "HEAD",
    branch: "codex/new",
    path: join(directory, "new"),
    ...overrides,
  }
}
function reopen() {
  storage.close()
  storage = openStore(join(directory, "state"))
  worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    worktrees: createWorktreeAdapter(),
    settings: createSettingsService,
  })
}

test("concurrent and restarted retries return the same IDs without resetting changed source or branch", async () => {
  const request = await input()
  const [a, b] = await Promise.all([worktrees.startWork(request), worktrees.startWork(request)])
  expect(a).toEqual(b)
  await writeFile(join(a.projectRoot, "source.ts"), "keep my changes")
  execFileSync("git", ["-C", a.checkoutRoot, "switch", "-c", "codex/later"], { stdio: "pipe" })
  reopen()
  expect(await worktrees.startWork(request)).toEqual(a)
  expect(await readFile(join(a.projectRoot, "source.ts"), "utf8")).toBe("keep my changes")
  expect(storage.store.listWorkItems()).toHaveLength(1)
  expect(storage.store.listWorktrees()).toHaveLength(1)
  await expect(worktrees.startWork({ ...request, intent: "Another intent" })).rejects.toMatchObject(
    { code: "work_start_conflict" },
  )
})

test.each(["directory", "file", "symlink", "branch", "branch-prefix", "registered-path"])(
  "rejects an existing %s without overwriting it",
  async (kind) => {
    const request = await input()
    if (kind === "directory") {
      await mkdir(request.path)
    }
    if (kind === "file") {
      await writeFile(request.path, "keep")
    }
    if (kind === "symlink") {
      const { symlink } = await import("node:fs/promises")
      await symlink(join(directory, "missing"), request.path)
    }
    if (kind === "branch") {
      git("branch", request.branch)
    }
    if (kind === "branch-prefix") {
      git("branch", "codex")
    }
    if (kind === "registered-path") {
      git("worktree", "add", "--detach", request.path)
      await rm(request.path, { recursive: true })
    }
    const before = git("show-ref")
    await expect(worktrees.startWork(request)).rejects.toMatchObject({
      code: "work_start_conflict",
    })
    expect(git("show-ref")).toBe(before)
    expect(storage.store.listWorkItems()).toEqual([])
    expect(storage.store.getWorkStart(request.requestId)).toBeUndefined()
    if (kind === "file") {
      expect(await readFile(request.path, "utf8")).toBe("keep")
    }
  },
)

test("rejects invalid refs, option-like inputs and relative destinations before mutation", async () => {
  const request = await input()
  for (const change of [
    { branch: "--force" },
    { branch: "invalid..branch" },
    { baseRef: "--help" },
    { baseRef: "missing-ref" },
    { path: "relative" },
  ]) {
    await expect(worktrees.startWork({ ...request, ...change })).rejects.toBeInstanceOf(Error)
  }
  expect(existsSync(request.path)).toBe(false)
  expect(storage.store.getWorkStart(request.requestId)).toBeUndefined()
})

test("initial request storage failure cannot create a branch or directory", async () => {
  const request = await input()
  vi.spyOn(storage.store, "saveWorkStart").mockImplementationOnce(() => {
    throw new Error("Disk full")
  })
  await expect(worktrees.startWork(request)).rejects.toThrow("Disk full")
  expect(existsSync(request.path)).toBe(false)
  expect(git("branch", "--list", request.branch)).toBe("")
  expect(storage.store.listWorkItems()).toEqual([])
})

test.each(["worktree", "work", "completed"])(
  "resumes after %s publication fails and the server restarts",
  async (phase) => {
    const request = await input()
    if (phase === "worktree") {
      vi.spyOn(storage.store, "saveWorktree").mockImplementationOnce(() => {
        throw new Error("Disk full")
      })
    }
    if (phase === "work") {
      vi.spyOn(storage.store, "createWorkItem").mockImplementationOnce(() => {
        throw new Error("Disk full")
      })
    }
    if (phase === "completed") {
      const save = storage.store.saveWorkStart
      vi.spyOn(storage.store, "saveWorkStart").mockImplementation((record) => {
        if (record.state === "completed") {
          throw new Error("Disk full")
        }
        save(record)
      })
    }
    await expect(worktrees.startWork(request)).rejects.toMatchObject({
      code: "work_start_incomplete",
      recovery: { requestId: request.requestId, checkoutRoot: request.path, state: "created" },
    })
    expect(existsSync(join(request.path, ".git"))).toBe(true)
    const recorded = worktrees.getWorkStart(request.requestId)
    expect(recorded.state).toBe("created")
    await writeFile(join(request.path, "keep.txt"), "User work")
    vi.restoreAllMocks()
    reopen()
    await worktrees.listWorktrees(request.projectId)
    const resumed = await worktrees.startWork(request)
    expect(resumed.workItemId).toBe(recorded.workItemId)
    expect(resumed.worktreeId).toBe(recorded.worktreeId)
    expect(storage.store.listWorkItems()).toHaveLength(1)
    expect(await readFile(join(request.path, "keep.txt"), "utf8")).toBe("User work")
    expect(worktrees.getWorkStart(request.requestId).state).toBe("completed")
  },
)

test.each(["Git", "created-record"])(
  "retains recovery location for uncertain %s failure and never repeats creation",
  async (phase) => {
    const request = await input()
    const adapter = createWorktreeAdapter()
    const create = vi.spyOn(adapter, "create")
    if (phase === "Git") {
      const actual = createWorktreeAdapter()
      create.mockImplementation(async (...args) => {
        await actual.create(...args)
        throw new Error("Lost completion")
      })
    } else {
      const save = storage.store.saveWorkStart
      vi.spyOn(storage.store, "saveWorkStart").mockImplementation((record) => {
        if (record.state === "created") {
          throw new Error("Disk full")
        }
        save(record)
      })
    }
    worktrees = createWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      worktrees: adapter,
      settings: createSettingsService,
    })
    await expect(worktrees.startWork(request)).rejects.toMatchObject({
      code: "work_start_incomplete",
      recovery: { checkoutRoot: request.path, state: "attempted" },
    })
    expect(existsSync(join(request.path, ".git"))).toBe(true)
    await expect(worktrees.startWork(request)).rejects.toMatchObject({
      code: "work_start_incomplete",
    })
    expect(create).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    reopen()
    await expect(worktrees.startWork(request)).rejects.toMatchObject({
      recovery: { checkoutRoot: request.path, state: "attempted" },
    })
    expect(storage.store.listWorkItems()).toHaveLength(0)
    expect(existsSync(join(request.path, ".git"))).toBe(true)
  },
)

test("request lookup and completed retries preserve history after a checkout is removed", async () => {
  const request = await input()
  const result = await worktrees.startWork(request)
  await rm(request.path, { recursive: true })
  reopen()
  expect(await worktrees.startWork(request)).toEqual(result)
  expect(worktrees.getWorkStart(request.requestId).checkoutRoot).toBe(request.path)
  expect(existsSync(request.path)).toBe(false)
  await expect(worktrees.resolve(result.worktreeId)).rejects.toMatchObject({
    code: "worktree_unavailable",
  })
})

test("uses the pinned base commit and disables checkout hooks", async () => {
  const request = await input()
  git("branch", "base")
  request.baseRef = "base"
  await writeFile(
    join(repository, ".git/hooks/post-checkout"),
    `#!/bin/sh\ntouch '${join(directory, "hook-ran")}'\n`,
    { mode: 0o755 },
  )
  const expected = git("rev-parse", "base")
  const result = await worktrees.startWork(request)
  expect(result.revision).toBe(expected)
  expect(
    execFileSync("git", ["-C", result.checkoutRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
  ).toBe(expected)
  expect(existsSync(join(directory, "hook-ran"))).toBe(false)
})

test("rejects branch shorthand instead of expanding it to a previously checked-out name", async () => {
  git("switch", "-c", "previous")
  git("switch", "-c", "current")
  git("branch", "-D", "previous")
  const request = await input({ branch: "@{-1}" })
  await expect(worktrees.startWork(request)).rejects.toMatchObject({ code: "invalid_input" })
  expect(git("branch", "--list", "previous")).toBe("")
  expect(existsSync(request.path)).toBe(false)
})

test("store rejects an initial completed request without creating recovery evidence", async () => {
  const request = await input()
  expect(() =>
    storage.store.saveWorkStart({
      id: request.requestId,
      input: request,
      checkoutRoot: request.path,
      revision: git("rev-parse", "HEAD"),
      worktreeId: randomUUID(),
      workItemId: randomUUID(),
      createdAt: new Date().toISOString(),
      state: "completed",
    }),
  ).toThrow("transition")
  expect(storage.store.getWorkStart(request.requestId)).toBeUndefined()
})

test("resumes a prepared request with its original revision after the base ref moves", async () => {
  const request = await input()
  const original = git("rev-parse", "HEAD")
  const save = storage.store.saveWorkStart
  vi.spyOn(storage.store, "saveWorkStart").mockImplementation((record) => {
    if (record.state === "attempted") {
      throw new Error("Disk full")
    }
    save(record)
  })
  await expect(worktrees.startWork(request)).rejects.toMatchObject({
    code: "work_start_incomplete",
  })
  expect(worktrees.getWorkStart(request.requestId).state).toBe("prepared")
  expect(existsSync(request.path)).toBe(false)
  await writeFile(join(repository, "apps/api/source.ts"), "new base")
  git("add", ".")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "moved")
  vi.restoreAllMocks()
  reopen()
  const result = await worktrees.startWork(request)
  expect(result.revision).toBe(original)
  expect(await readFile(join(result.projectRoot, "source.ts"), "utf8")).toContain("value = 1")
})

test("HTTP creation retries preserve IDs and durable partial failure details", async () => {
  const request = await input()
  const settings = createSettingsService(repository)
  const runs = createTestExecution({
    store: storage.store,
    settings,
    runner: {
      version: "test",
      execute: async () => ({ outcome: "passed", cases: [], errors: [] }),
    },
    scheduler: { add: async () => undefined as never, idle: async () => {} },
  })
  const submissions = createSubmissions({
    store: storage.store,
    worktrees,
    parse: () => ({ scenarios: [], limitations: [] }),
    runnerVersion: "test",
  })
  const app = createApp({ worktrees, settings, runs, submissions })

  const headers = {
    "Content-Type": "application/json",
    Host: "localhost",
    Accept: "application/json, text/event-stream",
  }
  const operation = (name: string, args: object) => managementHttp(app, name, args)
  vi.spyOn(storage.store, "saveWorktree").mockImplementationOnce(() => {
    throw new Error("Storage interrupted")
  })
  const failed = await app.request("/api/work-starts", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  })
  expect(failed.status).toBe(409)
  expect(await failed.json()).toMatchObject({
    code: "work_start_incomplete",
    recovery: { requestId: request.requestId, checkoutRoot: request.path, state: "created" },
  })
  const record = await operation("get_work_start", { id: request.requestId })
  expect(record.structuredContent).toMatchObject({ state: "created", checkoutRoot: request.path })
  const result = await operation("start_work", request)
  expect(result.isError).not.toBe(true)
  const repeated = await app.request("/api/work-starts", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  })
  expect(repeated.status).toBe(200)
  expect(await repeated.json()).toEqual(result.structuredContent)
  const collision = await operation("start_work", { ...request, requestId: randomUUID() })
  expect(collision).toMatchObject({
    isError: true,
    structuredContent: { code: "work_start_conflict" },
  })
  const second = {
    ...request,
    requestId: randomUUID(),
    branch: "codex/second",
    path: join(directory, "second"),
  }
  vi.spyOn(storage.store, "saveWorktree").mockImplementationOnce(() => {
    throw new Error("Storage interrupted")
  })
  expect(await operation("start_work", second)).toMatchObject({
    isError: true,
    structuredContent: { code: "work_start_incomplete", recovery: { checkoutRoot: second.path } },
  })
  const invalid = await app.request("/api/work-starts", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...request, prepare: true }),
  })
  expect(invalid.status).toBe(400)
  expect(
    (
      await app.request("/api/work-starts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
    ).status,
  ).toBe(200)
  await runs.close()
})

test("directory projects cannot create worktrees", async () => {
  const plain = join(directory, "plain")
  await mkdir(plain)
  const project = await worktrees.connect(plain)
  const request = await input({ projectId: project.id })
  await expect(worktrees.startWork(request)).rejects.toMatchObject({ code: "invalid_input" })
  expect(existsSync(request.path)).toBe(false)
})

test("reports invalid base refs and missing parents as input errors before creating a request", async () => {
  const request = await input()
  await expect(worktrees.startWork({ ...request, baseRef: "missing-ref" })).rejects.toMatchObject({
    code: "invalid_input",
  })
  await expect(
    worktrees.startWork({ ...request, path: join(directory, "missing/new") }),
  ).rejects.toMatchObject({ code: "invalid_input" })
  expect(storage.store.getWorkStart(request.requestId)).toBeUndefined()
})

test("a real Git checkout failure retains durable recovery evidence and is not retried", async () => {
  await writeFile(join(repository, ".gitattributes"), "*.ts filter=broken\n")
  git("add", ".gitattributes")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "filter")
  git("config", "filter.broken.smudge", "false")
  git("config", "filter.broken.required", "true")
  const request = await input()
  await expect(worktrees.startWork(request)).rejects.toMatchObject({
    code: "work_start_incomplete",
    recovery: { state: "attempted", checkoutRoot: request.path },
  })
  expect(worktrees.getWorkStart(request.requestId).state).toBe("attempted")
  expect(storage.store.listWorkItems()).toEqual([])
  git("config", "--unset", "filter.broken.required")
  git("config", "--unset", "filter.broken.smudge")
  await expect(worktrees.startWork(request)).rejects.toMatchObject({
    code: "work_start_incomplete",
  })
})

test("serializes attachment behind an in-progress managed creation", async () => {
  const request = await input()
  const adapter = createWorktreeAdapter()
  const actual = createWorktreeAdapter()
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let created: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    created = resolve
  })
  vi.spyOn(adapter, "create").mockImplementation(async (...args) => {
    await actual.create(...args)
    created()
    await gate
  })
  worktrees = createWorktrees({
    store: storage.store,
    git: createGitAdapter(),
    worktrees: adapter,
    settings: createSettingsService,
  })
  const starting = worktrees.startWork(request)
  await ready
  const attaching = worktrees.ensure(request.projectId, request.path)
  // Let a competing attach reach its filesystem reads while creation is still pending.
  await new Promise((resolve) => setTimeout(resolve, 50))
  release()
  const [started, attached] = await Promise.allSettled([starting, attaching])
  expect(started.status).toBe("fulfilled")
  expect(attached.status).toBe("fulfilled")
  if (started.status !== "fulfilled" || attached.status !== "fulfilled") {
    return
  }
  expect(attached.value.id).toBe(started.value.worktreeId)
  expect(storage.store.getWorkStart(started.value.requestId)?.worktreeId).toBe(attached.value.id)
  expect(storage.store.listWorkItems()).toHaveLength(1)
})
