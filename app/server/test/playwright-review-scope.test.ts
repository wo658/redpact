import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { discoverPlaywright } from "../src/adapters/playwright/catalog.js"
import { catalogPaths } from "../src/adapters/sources/unit-tests.js"
import { createApp } from "../src/app.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import { createPlaywrightCatalog } from "../src/workflows/playwright-catalog.js"

test("worktree review includes drafts and changed maintained sources while project keeps all maintained sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "playwright-review-"))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  const put = async (path: string, source = "// source") => {
    await mkdir(join(root, path, ".."), { recursive: true })
    await writeFile(join(root, path), source)
  }
  try {
    git("init", "-b", "main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "Test")
    await put(".gitignore", "browser/worktree/\n")
    for (const path of ["unchanged", "committed", "staged", "unstaged", "renamed", "deleted"]) {
      await put(`browser/project/tests/${path}.ts`, `// ${path}`)
    }
    await put("browser/project/captures/screen.ts")
    git("add", ".")
    git("commit", "-m", "base")
    const base = git("rev-parse", "HEAD")
    git("checkout", "-b", "feature")
    await put("browser/project/tests/committed.ts", "// committed edit")
    git("add", ".")
    git("commit", "-m", "feature")
    await put("browser/project/tests/staged.ts", "// staged edit")
    await rename(
      join(root, "browser/project/tests/renamed.ts"),
      join(root, "browser/project/tests/new-name.ts"),
    )
    git("add", ".")
    await put("browser/project/tests/unstaged.ts", "// working edit")
    await put("browser/project/tests/added.ts")
    await put("browser/project/captures/screen.ts", "// changed capture")
    await rm(join(root, "browser/project/tests/deleted.ts"))
    await put("browser/worktree/tests/draft.ts")
    await put("browser/worktree/captures/draft.ts")
    const settings = settingsSchema.parse({
      playwright: {
        directory: "browser",
        service: "app",
        port: 3000,
        targets: {
          captures: { scope: "project", purpose: "capture", testMatch: ["project/captures/*.ts"] },
          tests: { scope: "project", purpose: "functional", testMatch: ["project/tests/*.ts"] },
          drafts: { scope: "worktree", purpose: "functional", testMatch: ["worktree/tests/*.ts"] },
          "draft-captures": {
            scope: "worktree",
            purpose: "capture",
            testMatch: ["worktree/captures/*.ts"],
          },
        },
      },
    })
    let comparisonError = false
    const catalog = createPlaywrightCatalog({
      projects: { root: async () => root, tracking: async () => ({ mainBranch: "main" }) },
      worktrees: {
        projectSettings: async () => ({ read: async () => ({ valid: true, settings }) }),
        resolve: async () => ({
          worktree: { projectRoot: root, projectId: "p" },
          settings: { read: async () => ({ valid: true, settings }) },
          git: {
            mergeBase: async () => {
              if (comparisonError) {
                throw new Error("Comparison unavailable")
              }
              return base
            },
          },
        }),
      },
      discover: discoverPlaywright,
      changedPaths: (path: string, revision: string) => catalogPaths(path, revision, "changed"),
      read: async () => "source",
    } as never)
    const app = createApp({
      captures: {},
      captureWorkflow: {},
      playwrightCatalog: catalog,
    } as never)
    const response = await app.request("/api/worktrees/w/playwright/catalog")
    expect(response.status).toBe(200)
    const review = await response.json()
    expect(review.baseRevision).toBe(base)
    expect(review.files.map((file: { path: string }) => file.path)).toEqual([
      "project/captures/screen.ts",
      "project/tests/added.ts",
      "project/tests/committed.ts",
      "project/tests/new-name.ts",
      "project/tests/staged.ts",
      "project/tests/unstaged.ts",
      "worktree/captures/draft.ts",
      "worktree/tests/draft.ts",
    ])
    expect(review.diagnostics).toEqual([])
    const project = await catalog.inspect("p")
    expect(project.files.some((file) => file.path === "project/tests/unchanged.ts")).toBe(true)
    expect(project.files.some((file) => file.scope === "worktree")).toBe(false)
    comparisonError = true
    const unavailable = await (await app.request("/api/worktrees/w/playwright/catalog")).json()
    expect(unavailable.files.map((file: { path: string }) => file.path)).toEqual([
      "worktree/captures/draft.ts",
      "worktree/tests/draft.ts",
    ])
    expect(unavailable.diagnostics).toEqual(["Comparison unavailable"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
