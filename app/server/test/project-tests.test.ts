import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import { createIntegrationTests } from "../src/workflows/integration-tests.js"

test("full integration inspection bypasses comparison and validates its HTTP scope", async () => {
  const mergeBase = vi.fn(async () => "base")
  const catalog = vi.fn(async () => ({
    files: [{ path: "tests/existing.test.ts", source: "existing" }],
    diagnostics: [],
  }))
  const integrationTests = createIntegrationTests({
    worktrees: {
      resolve: async () => ({
        worktree: { projectId: "p", projectRoot: "/checkout" },
        git: { mergeBase },
      }),
    },
    projects: { tracking: async () => ({ mainBranch: "main" }) },
    settings: { project: async () => ({ issues: [], value: { tests: { directory: "tests" } } }) },
    files: { catalog },
  } as never)
  const runWorktreeTests = vi.fn(async () => ({ id: "run", state: "queued" }))
  const app = createApp({ integrationTests, runWorktreeTests } as never)
  const response = await app.request("/api/worktrees/w/integration-tests?scope=all")
  expect(response.status).toBe(200)
  expect((await response.json()).catalog.files[0].source).toBe("existing")
  expect(mergeBase).not.toHaveBeenCalled()
  expect(catalog).toHaveBeenCalledWith("/checkout", null, expect.any(Array), "tests", "all")
  expect(runWorktreeTests).not.toHaveBeenCalled()
  expect((await app.request("/api/worktrees/w/integration-tests?scope=invalid")).status).toBe(400)
  const run = await app.request("/api/worktrees/w/integration-tests/run", { method: "POST" })
  expect(run.status).toBe(202)
  expect(runWorktreeTests).toHaveBeenCalledWith("w")
})

test("current integration execution captures all sources from the resolved worktree with project defaults instead of worktree choices", async () => {
  const { createRunWorktreeTests } = await import("../src/workflows/run-files.js")
  const selection = { services: ["app"], select: { payment: "mock" } }
  const sources = [{ path: "unchanged.test.ts", source: "current contents" }]
  const readTests = vi.fn(async () => sources)
  const submitForWork = vi.fn(async () => ({ id: "fresh" }))
  const start = vi.fn(async () => ({ id: "run", submissionId: "fresh" }))
  const connect = vi.fn(async () => ({ id: "project" }))
  const deps = {
    worktrees: {
      resolve: async () => ({ worktree: { projectRoot: "/feature", projectId: "project" } }),
      connect,
      ensure: async () => ({ id: "feature" }),
      getSelection: vi.fn(async () => ({ services: ["unrelated"], select: {} })),
      getIntegrationDefaults: vi.fn(async () => ({ selection, saved: true })),
      settingsForPath: async () => ({
        read: async () => ({ valid: true, settings: { tests: { directory: "acceptance" } } }),
      }),
    },
    files: { readTests },
    submissions: { createWork: async () => ({ id: "work" }), submitForWork },
    executeTests: { start },
  }
  const execute = createRunWorktreeTests(deps as never)
  await execute("feature")
  expect(connect).toHaveBeenCalledWith("/feature")
  expect(readTests).toHaveBeenCalledWith("/feature", "acceptance", undefined)
  expect(submitForWork).toHaveBeenCalledWith("work", sources)
  expect(start).toHaveBeenCalledWith("fresh", selection)
  expect(deps.worktrees.getSelection).not.toHaveBeenCalled()
  expect(deps.worktrees.getIntegrationDefaults).toHaveBeenCalledWith("project")
  readTests.mockClear()
  start.mockClear()
  deps.worktrees.getIntegrationDefaults.mockRejectedValueOnce(
    Object.assign(new Error("Invalid defaults"), { code: "invalid_input" }),
  )
  await expect(execute("feature")).rejects.toMatchObject({ code: "invalid_input" })
  expect(readTests).not.toHaveBeenCalled()
  expect(start).not.toHaveBeenCalled()
})

test("unit HTTP scopes are explicit and read-only", async () => {
  const inspect = vi.fn(async () => ({
    settings: null,
    catalog: { files: [], diagnostics: [] },
    runs: [],
  }))
  const start = vi.fn()
  const app = createApp({ unitTests: { inspect, start } } as never)
  expect((await app.request("/api/worktrees/w/unit-tests?scope=all")).status).toBe(200)
  expect(inspect).toHaveBeenLastCalledWith("w", "all")
  expect((await app.request("/api/worktrees/w/unit-tests")).status).toBe(200)
  expect(inspect).toHaveBeenLastCalledWith("w", "changed")
  expect((await app.request("/api/worktrees/w/unit-tests?scope=invalid")).status).toBe(400)
  expect(start).not.toHaveBeenCalled()
})
