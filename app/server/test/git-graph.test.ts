import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createApp } from "../src/app.js"

let dir: string
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim()
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "redpact-graph-"))
  git("init", "-q", "-b", "main")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
})
afterEach(() => rm(dir, { recursive: true, force: true }))
function app() {
  return createApp({
    projectGraph: {
      diff: async (_id: string, oid: string) => {
        const { readCommitDiff } = await import("../src/adapters/git/commit-diff.js")
        return readCommitDiff(dir, oid)
      },
      history: async (_id: string, input: unknown) => {
        const { readHistory } = await import("../src/adapters/git/history.js")
        return readHistory(dir, input as never)
      },
    },
  } as never)
}
async function page(query = "") {
  const response = await app().request(`/api/projects/project/git/graph${query}`)
  expect(response.status).toBe(200)
  return response.json()
}
const commit = (message: string) => {
  git("commit", "--allow-empty", "-qm", message)
  return git("rev-parse", "HEAD")
}

test("모든 브랜치의 분기·병합과 태그를 읽고 작업 파일과 인덱스를 보존한다", async () => {
  const base = commit("시작")
  git("checkout", "-qb", "feature")
  const feature = commit("기능 | <script> & 메시지")
  git("checkout", "-q", "main")
  commit("메인 작업")
  git("merge", "--no-ff", "-qm", "병합", "feature")
  const merge = git("rev-parse", "HEAD")
  git("tag", "-a", "v1", "-m", "release")
  git("update-ref", "refs/remotes/origin/feature", feature)
  await writeFile(join(dir, "dirty.txt"), "staged")
  git("add", ".")
  const index = await readFile(join(dir, ".git/index"))
  await writeFile(join(dir, "dirty.txt"), "working")
  const result = await page()
  expect(result.commits[0].oid).toBe(merge)
  expect(result.commits[0].parents).toHaveLength(2)
  expect(result.commits.at(-1).oid).toBe(base)
  expect(result.commits.find((c: { oid: string }) => c.oid === feature).message).toBe(
    "기능 | <script> & 메시지",
  )
  expect(result.refs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "refs/heads/feature", target: feature, kind: "head" }),
      expect.objectContaining({
        name: "refs/remotes/origin/feature",
        target: feature,
        kind: "remote",
      }),
      expect.objectContaining({ name: "refs/tags/v1", target: merge, kind: "tag" }),
    ]),
  )
  expect(await readFile(join(dir, ".git/index"))).toEqual(index)
  expect(await readFile(join(dir, "dirty.txt"), "utf8")).toBe("working")
})

test("페이지를 이어 읽어도 중복이나 누락이 없고 변경된 히스토리는 재조회한다", async () => {
  const oldest = commit("one")
  commit("two")
  commit("three")
  const first = await page("?limit=2")
  expect(first.hasMore).toBe(true)
  const next = await page(`?limit=2&cursor=${encodeURIComponent(first.cursor)}`)
  expect(next.commits.map((c: { oid: string }) => c.oid)).toEqual([oldest])
  expect(next.hasMore).toBe(false)
  commit("four")
  const stale = await app().request(
    `/api/projects/project/git/graph?cursor=${encodeURIComponent(first.cursor)}`,
  )
  expect(stale.status).toBe(409)
})

test("선택한 브랜치의 조상만 보여주고 임의 Git 옵션을 거부한다", async () => {
  const base = commit("base")
  git("branch", "feature")
  commit("main only")
  const selected = await page("?ref=refs%2Fheads%2Ffeature")
  expect(selected.commits.map((c: { oid: string }) => c.oid)).toEqual([base])
  for (const query of ["ref=--all", "limit=10000", "cursor=bad"]) {
    const response = await app().request(`/api/projects/project/git/graph?${query}`)
    expect(response.status).toBe(400)
  }
})

test("커밋 없는 저장소는 빈 그래프로 표시하고 쓰기 API는 제공하지 않는다", async () => {
  expect(await page()).toMatchObject({ commits: [], refs: [], hasMore: false })
  expect((await app().request("/api/projects/project/git/graph", { method: "POST" })).status).toBe(
    404,
  )
})

test("브랜치에서 도달할 수 없는 detached 워크트리 커밋도 프로젝트 그래프에 포함한다", async () => {
  commit("base")
  const linked = join(dir, "linked")
  git("worktree", "add", "--detach", "-q", linked)
  execFileSync("git", ["-C", linked, "commit", "--allow-empty", "-qm", "detached"])
  const head = execFileSync("git", ["-C", linked, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  const result = await page()
  expect(result.commits.map((c: { oid: string }) => c.oid)).toContain(head)
  expect(result.refs).toContainEqual(expect.objectContaining({ kind: "current", target: head }))
})

test("선택한 커밋만 부모와 비교하고 최초 커밋·이름 변경·삭제·바이너리를 표시한다", async () => {
  await writeFile(join(dir, "old.txt"), "original\n")
  await writeFile(join(dir, "deleted.txt"), "delete me\n")
  git("add", ".")
  const root = commit("root")
  const read = async (oid: string) => {
    const response = await app().request(`/api/projects/project/git/commits/${oid}/diff`)
    expect(response.status).toBe(200)
    return response.json()
  }
  expect(await read(root)).toMatchObject({
    revision: root,
    patch: expect.stringContaining("+original"),
  })
  git("mv", "old.txt", "renamed.txt")
  git("rm", "deleted.txt")
  await writeFile(join(dir, "binary.dat"), Buffer.from([0, 1, 2]))
  git("add", ".")
  const selected = commit("changes")
  await writeFile(join(dir, "renamed.txt"), "later commit\n")
  git("add", ".")
  commit("later")
  await writeFile(join(dir, "renamed.txt"), "working changes\n")
  const index = await readFile(join(dir, ".git/index"))
  const result = await read(selected)
  expect(result).toMatchObject({ available: true, revision: selected, baseRevision: root })
  expect(result.patch).toContain("rename to renamed.txt")
  expect(result.patch).toContain("-delete me")
  expect(result.patch).toContain("Binary files")
  expect(result.patch).not.toContain("later commit")
  expect(result.patch).not.toContain("working changes")
  expect(await readFile(join(dir, ".git/index"))).toEqual(index)
  expect(await readFile(join(dir, "renamed.txt"), "utf8")).toBe("working changes\n")
})

test("병합은 첫 부모와 비교하고 빈 커밋은 빈 diff를 반환한다", async () => {
  const base = commit("base")
  git("checkout", "-qb", "feature")
  await writeFile(join(dir, "feature.txt"), "feature\n")
  git("add", ".")
  commit("feature")
  git("checkout", "-q", "main")
  git("merge", "--no-ff", "-qm", "merge", "feature")
  const head = git("rev-parse", "HEAD")
  const response = await app().request(`/api/projects/project/git/commits/${head}/diff`)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    baseRevision: base,
    patch: expect.stringContaining("+feature"),
  })
  const empty = commit("empty")
  const emptyResponse = await app().request(`/api/projects/project/git/commits/${empty}/diff`)
  expect(await emptyResponse.json()).toMatchObject({ patch: "" })
})

test("커밋 diff는 전체 SHA만 허용하고 없는 커밋을 명시적으로 거부한다", async () => {
  for (const oid of ["HEAD", "--all", "a".repeat(39)]) {
    expect((await app().request(`/api/projects/project/git/commits/${oid}/diff`)).status).toBe(400)
  }
  expect(
    (await app().request(`/api/projects/project/git/commits/${"a".repeat(40)}/diff`)).status,
  ).toBe(404)
})
