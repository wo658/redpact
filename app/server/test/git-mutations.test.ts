import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitMutations } from "../src/adapters/git/mutations.js"

let root: string
let source: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim()
const adapter = createGitMutations()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-merge-test-"))
  git(root, "init", "-qb", "main")
  git(root, "config", "user.email", "test@example.com")
  git(root, "config", "user.name", "Test")
  await writeFile(join(root, ".gitignore"), "ignored\n")
  await writeFile(join(root, "file.txt"), "base\n")
  git(root, "add", ".")
  git(root, "commit", "-qm", "base")
  source = `${root}-feature`
  git(root, "worktree", "add", "-qb", "feature", source)
})
afterEach(async () => {
  await rm(source, { recursive: true, force: true })
  await rm(root, { recursive: true, force: true })
})

test("미커밋 화면은 staged·unstaged·새 파일을 구분하고 무시된 파일을 제외한다", async () => {
  await writeFile(join(source, "file.txt"), "staged\n")
  git(source, "add", "file.txt")
  await writeFile(join(source, "file.txt"), "working\n")
  await writeFile(join(source, "new.txt"), "new\n")
  await writeFile(join(source, "ignored"), "private\n")
  const state = await adapter.inspect(source)
  expect(state.dirty).toBe(true)
  expect(state.files).toEqual([
    { path: "file.txt", staged: true, unstaged: true, untracked: false },
    { path: "new.txt", staged: false, unstaged: false, untracked: true },
  ])
  expect(state.staged.patch).toContain("+staged")
  expect(state.unstaged.patch).toContain("+working")
  expect(state.unstaged.patch).toContain("+new")
})

test("확인 이후 내용이 바뀌면 커밋과 버리기를 거절한다", async () => {
  await writeFile(join(source, "file.txt"), "first\n")
  const state = await adapter.inspect(source)
  await writeFile(join(source, "file.txt"), "later\n")
  await expect(adapter.commit(source, state.revision, "save")).rejects.toMatchObject({
    code: "worktree_busy",
  })
  await expect(adapter.discard(source, state.revision)).rejects.toMatchObject({
    code: "worktree_busy",
  })
  expect(await readFile(join(source, "file.txt"), "utf8")).toBe("later\n")
})

test("커밋은 확인한 모든 변경을 저장하며 버리기는 새 파일까지 정리하고 ignored 파일을 보존한다", async () => {
  await writeFile(join(source, "file.txt"), "saved\n")
  await writeFile(join(source, "new.txt"), "saved new\n")
  const state = await adapter.inspect(source)
  await adapter.commit(source, state.revision, "save changes")
  expect((await adapter.inspect(source)).dirty).toBe(false)
  expect(git(source, "show", "HEAD:new.txt")).toBe("saved new")
  await writeFile(join(source, "file.txt"), "discard\n")
  await writeFile(join(source, "extra.txt"), "discard new\n")
  await writeFile(join(source, "ignored"), "keep\n")
  await adapter.discard(source, (await adapter.inspect(source)).revision)
  expect((await adapter.inspect(source)).dirty).toBe(false)
  expect(await readFile(join(source, "file.txt"), "utf8")).toBe("saved\n")
  await expect(readFile(join(source, "extra.txt"))).rejects.toMatchObject({ code: "ENOENT" })
  expect(await readFile(join(source, "ignored"), "utf8")).toBe("keep\n")
})

test("버리기는 staged 추가와 삭제도 복원하고 이미 진행 중인 Git 작업을 건드리지 않는다", async () => {
  await writeFile(join(source, "added.txt"), "added\n")
  git(source, "add", "added.txt")
  await rm(join(source, "file.txt"))
  await adapter.discard(source, (await adapter.inspect(source)).revision)
  expect((await adapter.inspect(source)).dirty).toBe(false)
  expect(await readFile(join(source, "file.txt"), "utf8")).toBe("base\n")
  await expect(readFile(join(source, "added.txt"))).rejects.toMatchObject({ code: "ENOENT" })
  await writeFile(join(source, "file.txt"), "keep\n")
  const gitdir = git(source, "rev-parse", "--absolute-git-dir")
  await writeFile(join(gitdir, "MERGE_HEAD"), `${git(root, "rev-parse", "HEAD")}\n`)
  const pending = await adapter.inspect(source)
  expect(pending.blockedReason).toContain("in progress")
  await expect(adapter.discard(source, pending.revision)).rejects.toMatchObject({
    code: "worktree_busy",
  })
  expect(await readFile(join(source, "file.txt"), "utf8")).toBe("keep\n")
})
