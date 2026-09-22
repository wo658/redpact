import { expect, test, vi } from "vitest"
import { createObserveProjects } from "../src/workflows/observe-projects.js"

function fixture() {
  let roots = ["/repo", "/repo/.codex/worktrees/feature"]
  let directory = "checks"
  let valid = true
  const read = vi.fn(async () => ({
    valid,
    settings: { tests: { directory }, composeFiles: ["compose.yaml"], services: ["app"] },
    issues: [],
    file: "/repo/.redpact/settings.json",
  }))
  const readTests = vi.fn(async () => [])
  const resolve = vi.fn(async () => ({ settings: { read, rulesRoot: "/repo" } }))
  const observe = createObserveProjects({
    worktrees: {
      connect: async () => ({
        id: "project",
        location: { kind: "git", commonGitdir: "/repo/.git", projectPath: "." },
      }),
      ensure: async (_id: string, root: string) => ({
        id: root,
        gitdir: root === "/repo" ? "/repo/.git" : "/repo/.git/worktrees/feature",
      }),
      resolve,
    } as never,
    files: { readTests } as never,
    submissions: {
      latest: () => ({ files: [] }),
    } as never,
    checkouts: async () => roots,
  })
  return {
    observe: (changes?: string[]) => observe(["/repo"], changes),
    read,
    readTests,
    resolve,
    roots: (value: string[]) => {
      roots = value
    },
    directory: (value: string) => {
      directory = value
    },
    valid: (value: boolean) => {
      valid = value
    },
    clear: () => {
      read.mockClear()
      readTests.mockClear()
      resolve.mockClear()
    },
  }
}

test("source and unrelated authored preferences do not validate settings or collect tests", async () => {
  const f = fixture()
  await f.observe()
  for (const suffix of [
    "source.ts",
    ".redpact/selection.json",
    ".redpact/tracking.json",
    ".redpact/capture-notes.json",
  ]) {
    f.clear()
    await f.observe([`/repo/${suffix}`, `/repo/.codex/worktrees/feature/${suffix}`])
    expect(f.resolve, suffix).not.toHaveBeenCalled()
    expect(f.readTests, suffix).not.toHaveBeenCalled()
  }
})

test("test and Compose changes collect only their owning checkout, including ancestor removal", async () => {
  const f = fixture()
  await f.observe()
  for (const suffix of ["checks/a.test.ts", "checks", "compose.yaml"]) {
    f.clear()
    await f.observe([`/repo/.codex/worktrees/feature/${suffix}`])
    expect(f.readTests.mock.calls).toEqual([["/repo/.codex/worktrees/feature", "checks"]])
  }
})

test("shared settings refresh every checkout and replace the remembered test directory", async () => {
  const f = fixture()
  await f.observe()
  f.directory("new-tests")
  f.clear()
  await f.observe(["/repo/.redpact/settings.json"])
  expect(f.readTests).toHaveBeenCalledTimes(2)
  f.clear()
  await f.observe(["/repo/checks/a.test.ts"])
  expect(f.readTests).not.toHaveBeenCalled()
  await f.observe(["/repo/new-tests/a.test.ts"])
  expect(f.readTests).toHaveBeenCalledExactlyOnceWith("/repo", "new-tests")
})

test("invalid settings recover on settings restoration and checkout discovery collects new roots", async () => {
  const f = fixture()
  f.valid(false)
  await f.observe()
  f.clear()
  await f.observe(["/repo/source.ts"])
  expect(f.read).not.toHaveBeenCalled()
  f.valid(true)
  await f.observe(["/repo/.redpact/settings.json"])
  expect(f.readTests).toHaveBeenCalledTimes(2)
  f.clear()
  f.roots(["/repo"])
  expect((await f.observe(["/repo/.git/worktrees/feature"])).watchPaths).not.toContain(
    "/repo/.codex/worktrees/feature",
  )
  f.clear()
  f.roots(["/repo", "/repo/.codex/worktrees/feature"])
  await f.observe(["/repo/.git/worktrees/feature"])
  expect(f.readTests.mock.calls).toContainEqual(["/repo/.codex/worktrees/feature", "checks"])
})

test("an initially missing Compose file remains a tracked input and repairs observation", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { createSettingsService } = await import("../src/adapters/settings/json.js")
  const root = await mkdtemp(join(tmpdir(), "redpact-input-repair-"))
  try {
    await mkdir(join(root, ".redpact"))
    await writeFile(
      join(root, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["environment/custom.compose"],
        tests: { directory: "acceptance" },
      }),
    )
    const readTests = vi.fn(async () => [])
    const observe = createObserveProjects({
      worktrees: {
        connect: async () => ({ id: root, location: { kind: "directory", root } }),
        ensure: async () => ({ id: root, gitdir: null }),
        resolve: async () => ({ settings: createSettingsService(root) }),
      } as never,
      files: { readTests } as never,
      submissions: {
        latest: () => ({ files: [] }),
      } as never,
      checkouts: async () => [],
    })
    expect((await observe([root])).issues).toHaveLength(1)
    await mkdir(join(root, "environment"))
    await writeFile(
      join(root, "environment/custom.compose"),
      "services:\n  app:\n    image: alpine:3.21\n",
    )
    const result = await observe([root], [join(root, "environment/custom.compose")])
    expect(result.issues).toEqual([])
    expect(readTests).toHaveBeenCalledExactlyOnceWith(root, "acceptance")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
