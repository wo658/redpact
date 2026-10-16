import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { afterEach, expect, test } from "vitest"
import { executionChanges } from "../src/adapters/git/execution-changes.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "redpact-scope-"))
  roots.push(root)
  const git = (...args: string[]) => execa("git", args, { cwd: root })
  await git("init", "-b", "main")
  await git("config", "user.name", "Test")
  await git("config", "user.email", "test@example.invalid")
  for (const name of ["committed", "staged", "unstaged", "old", "deleted"]) {
    await writeFile(join(root, `${name}.test.ts`), name)
  }
  await git("add", ".")
  await git("commit", "-m", "base")
  const base = (await git("rev-parse", "HEAD")).stdout
  await git("checkout", "-b", "feature")
  return { root, git, base }
}
test("Git selection includes committed/index/worktree/untracked changes and both rename paths", async () => {
  const { root, git, base } = await repository()
  await writeFile(join(root, "committed.test.ts"), "committed change")
  await git("commit", "-am", "change")
  await writeFile(join(root, "staged.test.ts"), "staged change")
  await git("add", "staged.test.ts")
  await writeFile(join(root, "unstaged.test.ts"), "unstaged change")
  await rename(join(root, "old.test.ts"), join(root, "renamed.test.ts"))
  await rm(join(root, "deleted.test.ts"))
  await writeFile(join(root, "new space.test.ts"), "new")
  expect(await executionChanges(root, "main")).toEqual({
    baseRevision: base,
    paths: [
      "committed.test.ts",
      "deleted.test.ts",
      "new space.test.ts",
      "old.test.ts",
      "renamed.test.ts",
      "staged.test.ts",
      "unstaged.test.ts",
    ],
  })
})
test("unchanged and missing main branch are distinct", async () => {
  const { root, base } = await repository()
  expect(await executionChanges(root, "main")).toEqual({ baseRevision: base, paths: [] })
  await expect(executionChanges(root, null)).rejects.toThrow(/main branch/)
  await expect(executionChanges(root, "missing")).rejects.toThrow()
})
test("nested project paths remain relative to that project", async () => {
  const { root, git } = await repository()
  await mkdir(join(root, "nested"))
  await writeFile(join(root, "nested", "a.test.ts"), "base")
  await git("add", ".")
  await git("commit", "-m", "nested")
  await writeFile(join(root, "nested", "a.test.ts"), "changed")
  await writeFile(join(root, "nested", "new.test.ts"), "new")
  const result = await executionChanges(join(root, "nested"), "main")
  expect(result.paths).toEqual(["a.test.ts", "new.test.ts"])
})

test("index edits remain selected even when working content was restored", async () => {
  const { root, git } = await repository()
  await writeFile(join(root, "staged.test.ts"), "staged change")
  await git("add", "staged.test.ts")
  await writeFile(join(root, "staged.test.ts"), "staged")
  expect((await executionChanges(root, "main")).paths).toEqual(["staged.test.ts"])
})

test("committed renames keep old and new paths and ignored files stay excluded", async () => {
  const { root, git } = await repository()
  await git("mv", "old.test.ts", "new.test.ts")
  await git("commit", "-m", "rename")
  await writeFile(join(root, ".gitignore"), "ignored.test.ts\n")
  await writeFile(join(root, "ignored.test.ts"), "ignored")
  expect((await executionChanges(root, "main")).paths).toEqual([
    ".gitignore",
    "new.test.ts",
    "old.test.ts",
  ])
})

test("root-level Unit pattern prefixes retain the root helper directory", async () => {
  const { createExecutionScopeFiles } = await import("../src/adapters/sources/execution-scope.js")
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  const { root } = await repository()
  for (const pattern of ["*.test.ts", "foo*.test.ts", "a.test.ts"]) {
    const settings = settingsSchema.parse({
      unitTests: { command: "test", dockerfile: "Dockerfile", patterns: [pattern] },
    })
    const catalog = await createExecutionScopeFiles().catalog(root, settings, { kind: "unit" })
    expect(catalog.directories).toEqual(["."])
  }
})
