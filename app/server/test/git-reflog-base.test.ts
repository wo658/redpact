import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitAdapter } from "../src/adapters/git/isomorphic.js"
import { createGitService } from "../src/workflows/git.js"

let root: string
let base: string
let creation: string
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
const service = () => createGitService(root, createGitAdapter())
async function commit(path: string, source: string) {
  await writeFile(join(root, path), source)
  git("add", path)
  git("commit", "-qm", path)
  return git("rev-parse", "HEAD")
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "redpact-reflog-"))
  git("init", "-qb", "main")
  git("config", "user.name", "Test")
  git("config", "user.email", "test@example.com")
  base = await commit("base.txt", "base\n")
  git("checkout", "-qb", "parent")
  creation = await commit("parent.txt", "inherited\n")
  git("checkout", "-qb", "feature")
  await commit("child.txt", "child\n")
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** 부모 기능에서 물려받은 변경을 제외하고 생성 이후 커밋과 로컬 변경을 비교한다. */
test("생성 reflog의 커밋을 사용하고 부모가 전진해도 기준을 유지한다", async () => {
  git("checkout", "-q", "parent")
  await commit("later.txt", "later parent\n")
  git("checkout", "-q", "feature")
  await writeFile(join(root, "child.txt"), "working\n")
  await writeFile(join(root, "untracked.txt"), "untracked\n")
  const index = await readFile(join(root, ".git/index"))
  const reflog = await readFile(join(root, ".git/logs/refs/heads/feature"))
  const diff = await service().diff("all", "main")
  // 비교 기준은 프로젝트 공통 조상이 아니라 실제 브랜치 생성 커밋이어야 한다.
  expect(diff).toMatchObject({ available: true, baseRevision: creation })
  expect(diff.patch).toContain("+working")
  expect(diff.patch).toContain("+untracked")
  expect(diff.patch).not.toContain("parent.txt")
  expect(diff.patch).not.toContain("later.txt")
  expect(await service().mergeBase("main")).toBe(creation)
  expect(await readFile(join(root, ".git/index"))).toEqual(index)
  expect(await readFile(join(root, ".git/logs/refs/heads/feature"))).toEqual(reflog)
})

/** 기준 브랜치가 설정되지 않아도 생성 기록만으로 비교할 수 있다. */
test.each([null, "missing"])("생성 기록이 있으면 기준 브랜치 %s 없이 비교한다", async (main) => {
  expect(await service().diff("all", main)).toMatchObject({
    available: true,
    baseRevision: creation,
  })
})

/** 생성 기록이 사라진 후 가장 오래 남은 커밋을 분기점으로 오인하지 않는다. */
test("생성 항목만 삭제되면 공통 조상으로 돌아간다", async () => {
  git("reflog", "delete", "feature@{1}")
  expect(await service().diff("all", "main")).toMatchObject({ baseRevision: base })
  expect((await service().diff("all", "main")).patch).toContain("parent.txt")
  expect((await service().diff("all", null)).available).toBe(false)
})

/** 로컬 reflog가 없거나 HEAD가 분리된 경우 기존 비교를 유지한다. */
test.each(["expired", "detached"])("%s 상태에서는 공통 조상을 사용한다", async (mode) => {
  if (mode === "expired") {
    git("reflog", "expire", "--expire=all", "refs/heads/feature")
  } else {
    git("checkout", "--detach", "-q")
  }
  expect(await service().mergeBase("main")).toBe(base)
})

/** 부모를 제거하는 rebase 후 이전 생성 커밋을 비교 기준으로 재사용하지 않는다. */
test("rebase 이후에는 변경된 이력의 공통 조상을 사용한다", async () => {
  git("rebase", "--onto", "main", "parent", "feature")
  const diff = await service().diff("all", "main")
  expect(diff).toMatchObject({ available: true, baseRevision: base })
  expect(diff.patch).not.toContain("parent.txt")
  expect(diff.patch).toContain("child.txt")
})

/** 생성 커밋이 여전히 조상이어도 rebase로 들어온 기준 브랜치 변경은 제외한다. */
test("기준 브랜치 위로 rebase하면 새 공통 조상을 사용한다", async () => {
  git("checkout", "-q", "main")
  git("merge", "--ff-only", "parent")
  const advanced = await commit("main-later.txt", "main later\n")
  git("checkout", "-q", "feature")
  git("rebase", "main")
  expect(await service().mergeBase("main")).toBe(advanced)
})

/** 이름 변경은 같은 브랜치의 생성 기록을 유지하지만 복사는 새 분기 기록이 아니다. */
test("브랜치 이름 변경은 지원하고 복사된 reflog는 사용하지 않는다", async () => {
  git("branch", "-m", "renamed")
  expect(await service().mergeBase("main")).toBe(creation)
  git("branch", "-c", "copied")
  git("checkout", "-q", "copied")
  expect(await service().mergeBase("main")).toBe(base)
})

/** 프로젝트 기준 브랜치 자체의 전체 과거 작업을 새 변경으로 표시하지 않는다. */
test("현재 브랜치가 프로젝트 기준이면 현재 HEAD를 비교 기준으로 사용한다", async () => {
  expect(await service().mergeBase("feature")).toBe(git("rev-parse", "HEAD"))
})

/** 외부에서 만든 연결 워크트리의 공유 브랜치 reflog를 읽는다. */
test("연결 워크트리와 이미지 비교도 동일한 생성 커밋을 사용한다", async () => {
  git("checkout", "-q", "parent")
  const original = '<svg xmlns="http://www.w3.org/2000/svg"/>'
  const imageBase = await commit("image.svg", original)
  const linked = join(root, "linked")
  git("worktree", "add", "-qb", "image-feature", linked, "HEAD")
  await writeFile(join(linked, "image.svg"), `${original}\n`)
  const target = createGitService(linked, createGitAdapter())
  expect(await target.mergeBase("main")).toBe(imageBase)
  expect(await target.image("image.svg", "main")).toMatchObject({
    baseRevision: imageBase,
    before: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(original).toString("base64")}` },
  })
})

/** 생성 시점 이전으로 reset한 브랜치는 이전 기능의 삭제를 새 작업으로 표시하지 않는다. */
test("생성 커밋이 현재 HEAD의 조상이 아니면 공통 조상을 사용한다", async () => {
  git("reset", "--hard", "main")
  await commit("replacement.txt", "replacement\n")
  expect(await service().mergeBase("main")).toBe(base)
})

/** 지나치게 긴 reflog를 끝없이 읽거나 중간 항목을 생성 기록으로 오인하지 않는다. */
test("항목 제한을 넘는 reflog는 공통 조상으로 돌아간다", async () => {
  const path = join(root, ".git/logs/refs/heads/feature")
  const log = await readFile(path, "utf8")
  const last = log.trim().split("\n").at(-1)
  await writeFile(path, log + `${last}\n`.repeat(4096))
  expect(await service().mergeBase("main")).toBe(base)
})
