import { setTimeout as delay } from "node:timers/promises"
import { expect, test, vi } from "vitest"
import { instanceSettingsSchema } from "../src/core/instance-schema.js"

test("instance settings accept file-authored project roots without a registration command", () => {
  expect(instanceSettingsSchema.safeParse({ projects: ["/tmp/example"] }).success).toBe(true)
  expect(instanceSettingsSchema.safeParse({ projects: ["relative/project"] }).success).toBe(false)
})

import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { observeProjectFiles } from "../src/adapters/changes/projects.js"
import { discoverCheckouts } from "../src/adapters/git/discover.js"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { parseSource } from "../src/adapters/parser/source.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createLocalFiles } from "../src/adapters/sources/local.js"
import { openStore } from "../src/adapters/storage/files.js"
import { createObserveProjects } from "../src/workflows/observe-projects.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { createTestWorktrees } from "./helpers/worktrees.js"

test.skipIf(process.platform !== "darwin")(
  "project observation does not open a descriptor per source file",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "redpact-watch-resources-"))
    const root = join(directory, "repo")
    const settingsPath = join(directory, "settings.json")
    let observer: Awaited<ReturnType<typeof observeProjectFiles>> | undefined
    const descriptors = () =>
      execFileSync("lsof", ["-p", String(process.pid), "-Ff"], { encoding: "utf8" })
        .split("\n")
        .filter((line) => /^f\d/.test(line)).length
    try {
      await mkdir(root)
      await writeFile(settingsPath, "{}")
      await Promise.all(
        Array.from({ length: 200 }, (_, index) =>
          writeFile(join(root, `source-${index}.ts`), "initial"),
        ),
      )
      const before = descriptors()
      observer = await observeProjectFiles({
        settingsPath,
        defaults: [],
        observe: async () => ({ watchPaths: [root], issues: [] }),
        report: () => {},
      })
      await delay(500)
      expect(descriptors() - before).toBeLessThan(32)
    } finally {
      await observer?.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test("Next build output does not trigger project observation while source changes do", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-build-watch-"))
  const root = join(directory, "repo")
  const settingsPath = join(directory, "settings.json")
  let observer: Awaited<ReturnType<typeof observeProjectFiles>> | undefined
  try {
    await mkdir(join(root, ".next/server"), { recursive: true })
    await writeFile(join(root, ".next/server/bundle.js"), "initial")
    await writeFile(join(root, "source.ts"), "initial")
    await writeFile(settingsPath, "{}")
    const observe = vi.fn(async () => ({ watchPaths: [root], issues: [] }))
    observer = await observeProjectFiles({ settingsPath, defaults: [], observe, report: () => {} })
    await delay(1200)
    observe.mockClear()
    await writeFile(join(root, ".next/server/bundle.js"), "build")
    await delay(500)
    expect(observe).not.toHaveBeenCalled()
    await writeFile(join(root, "source.ts"), "changed")
    await expect.poll(() => observe.mock.calls.length, { timeout: 3000 }).toBeGreaterThan(0)
  } finally {
    await observer?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("editing project roots discovers native Git worktrees and live test changes without running them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-observation-"))
  const root = join(directory, "repo")
  const linked = join(root, ".codex/worktrees/linked")
  const settingsPath = join(directory, "settings.json")
  const storage = openStore(join(directory, "runtime"))
  let observer: Awaited<ReturnType<typeof observeProjectFiles>> | undefined
  try {
    await mkdir(join(root, "tests"), { recursive: true })
    await mkdir(join(root, ".redpact"))
    await writeFile(
      join(root, ".redpact/settings.json"),
      JSON.stringify({ composeFiles: ["compose.yaml"], tests: { directory: "tests" } }),
    )
    await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: alpine:3.21\n")
    await writeFile(join(root, "tests/a.test.ts"), "// first")
    const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })
    git("init")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture")
    await writeFile(settingsPath, "{}")
    const worktrees = createTestWorktrees({
      store: storage.store,
      git: createGitAdapter(),
      settings: createSettingsService,
    })
    const submissions = createSubmissions({
      store: storage.store,
      worktrees,
      parse: parseSource,
      runnerVersion: "fixture",
    })
    observer = await observeProjectFiles({
      settingsPath,
      defaults: [],
      observe: createObserveProjects({
        files: createLocalFiles(),
        worktrees,
        submissions,
        checkouts: discoverCheckouts,
      }),
      report: () => {},
    })
    expect(storage.store.listProjects()).toEqual([])
    await writeFile(settingsPath, JSON.stringify({ projects: [root] }))
    await expect.poll(() => storage.store.listSubmissions().length, { timeout: 5000 }).toBe(1)
    git("worktree", "add", "-b", "feature", linked)
    await expect.poll(() => storage.store.listWorktrees().length, { timeout: 5000 }).toBe(2)
    await expect.poll(() => storage.store.listSubmissions().length, { timeout: 5000 }).toBe(2)
    await writeFile(join(linked, "tests/a.test.ts"), "// second")
    await expect.poll(() => storage.store.listSubmissions().length, { timeout: 5000 }).toBe(3)
    expect(storage.store.listRuns()).toEqual([])
    expect(storage.store.listEnvironments()).toEqual([])
    expect(
      storage.store.listSubmissions().filter((item) => item.files[0].source === "// first"),
    ).toHaveLength(2)
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({ projects: [root] })
  } finally {
    await observer?.close()
    storage.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)

test("source observation skips collection and preserves other project watches", async () => {
  const projects = ["/one", "/two"].map((root) => ({
    id: root,
    name: root,
    createdAt: "now",
    location: { kind: "directory" as const, root },
  }))
  const connect = vi.fn(
    async (path: string) => projects.find((project) => project.id === path) ?? projects[0],
  )
  const ensure = vi.fn(async (projectId: string, root: string) => ({
    id: root,
    projectId,
    projectRoot: root,
    checkoutRoot: root,
    gitdir: null,
    createdAt: "now",
  }))
  const resolve = vi.fn(async (id: string) => ({
    worktree: await ensure(id, id),
    settings: { read: async () => ({ valid: false }) },
  }))
  const observe = createObserveProjects({
    worktrees: { connect, ensure, resolve } as never,
    files: {} as never,
    submissions: {} as never,
    checkouts: vi.fn(),
  })
  await observe(["/one", "/two"])
  connect.mockClear()
  resolve.mockClear()
  const result = await observe(["/one", "/two"], ["/one/source.ts"])
  expect(connect.mock.calls).toEqual([["/one"]])
  expect(resolve).not.toHaveBeenCalled()
  expect(result.watchPaths).toEqual(expect.arrayContaining(["/one", "/two"]))
  expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["/one", "/two"]))
})

test("nested checkout changes do not collect the primary checkout and removed watches are discarded", async () => {
  const primary = "/one"
  const linked = "/one/.codex/worktrees/linked"
  let roots = [primary, linked]
  const resolve = vi.fn(async () => ({ settings: { read: async () => ({ valid: false }) } }))
  const observe = createObserveProjects({
    worktrees: {
      connect: async () => ({
        id: "project",
        location: { kind: "git", commonGitdir: "/one/.git", projectPath: "." },
      }),
      ensure: async (_id: string, root: string) => ({
        id: root,
        gitdir: root === primary ? "/one/.git" : "/one/.git/worktrees/linked",
      }),
      resolve,
    } as never,
    files: {} as never,
    submissions: {} as never,
    checkouts: async () => roots,
  })
  await observe([primary])
  resolve.mockClear()
  await observe([primary], [`${linked}/tests/a.test.ts`])
  expect(resolve.mock.calls).toEqual([[linked]])
  roots = [primary]
  const result = await observe([primary], ["/one/.git/worktrees/linked"])
  expect(result.watchPaths).not.toContain(linked)
  expect(result.watchPaths).not.toContain("/one/.git/worktrees/linked")
})
