import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createGitMutations } from "../src/adapters/git/mutations.js"
import type { MergeRecord } from "../src/core/types/merge.js"
import { createMergeService } from "../src/workflows/merge.js"

let root: string
let source: string
let records: Map<string, MergeRecord>
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim()
const adapter = createGitMutations()
function service(paths = [root, source]) {
  return createMergeService({
    git: adapter,
    worktrees: {
      resolve: async () => ({
        worktree: {
          id: "feature",
          projectId: "project",
          checkoutRoot: source,
          projectRoot: source,
        },
      }),
      checkoutPaths: async () => paths,
    },
    projects: { tracking: async () => ({ mainBranch: "main", hideMerged: false }) },
    store: {
      list: () => [...records.values()],
      save: (value: MergeRecord) => {
        records.set(value.id, structuredClone(value))
      },
    },
    directory: root,
  })
}
beforeEach(async () => {
  records = new Map()
  root = await mkdtemp(join(tmpdir(), "redpact-merge-core-"))
  git(root, "init", "-qb", "main")
  git(root, "config", "user.email", "test@example.com")
  git(root, "config", "user.name", "Test")
  await writeFile(join(root, ".gitignore"), "merge-candidates/\n")
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
async function request() {
  return {
    requestId: randomUUID(),
    sourceRevision: (await adapter.inspect(source)).revision,
    targetRevision: (await adapter.inspect(root)).revision,
  }
}
test("미커밋 작업이 있으면 머지를 거절한다", async () => {
  await writeFile(join(source, "file.txt"), "dirty\n")
  await expect(service().merge("feature", await request())).rejects.toMatchObject({
    code: "worktree_busy",
  })
  expect(await readFile(join(source, "file.txt"), "utf8")).toBe("dirty\n")
})
test("대상에 미커밋 변경이 있으면 머지를 거절한다", async () => {
  await writeFile(join(root, "local.txt"), "unrelated\n")
  await expect(service().merge("feature", await request())).rejects.toMatchObject({
    code: "worktree_busy",
  })
  expect(await readFile(join(root, "local.txt"), "utf8")).toBe("unrelated\n")
})
test("깨끗한 작업은 대상에 머지하고 같은 요청을 다시 보내도 중복 머지하지 않는다", async () => {
  await writeFile(join(source, "feature.txt"), "feature\n")
  git(source, "add", ".")
  git(source, "commit", "-qm", "feature")
  const input = await request()
  const merges = service()
  const result = await merges.merge("feature", input)
  expect(result).toMatchObject({ state: "merged", sourceBranch: "feature", targetBranch: "main" })
  expect(await readFile(join(root, "feature.txt"), "utf8")).toBe("feature\n")
  expect(git(root, "rev-parse", "HEAD")).toBe(result.mergedHead)
  expect(await merges.merge("feature", input)).toEqual(result)
  expect(records.size).toBe(1)
})
test("충돌 시 양쪽 브랜치를 보존하고 새 세션용 해결 맥락을 기록한다", async () => {
  await writeFile(join(source, "file.txt"), "feature\n")
  git(source, "commit", "-am", "feature")
  await writeFile(join(root, "file.txt"), "main\n")
  git(root, "commit", "-am", "main")
  const before = git(root, "rev-parse", "HEAD")
  const result = await service().merge("feature", await request())
  expect(result).toMatchObject({ state: "conflict", conflicts: ["file.txt"], targetHead: before })
  expect(git(root, "rev-parse", "HEAD")).toBe(before)
  expect((await adapter.inspect(root)).dirty).toBe(false)
  expect((await adapter.inspect(source)).dirty).toBe(false)
  expect(result.resolutionRequest).toContain(source)
  expect(result.resolutionRequest).toContain("file.txt")
  expect(result.resolutionRequest).toContain(before)
  await expect(service().inspect("feature")).resolves.toMatchObject({
    records: [{ id: result.id }],
  })
})

test("다른 branch의 변경 내용은 머지 대상 탐색을 방해하지 않는다", async () => {
  const other = `${root}-other`
  git(root, "worktree", "add", "-qb", "other", other)
  try {
    git(other, "init", "nested")
    await expect(service([other, root, source]).inspect("feature")).resolves.toMatchObject({
      target: { branch: "main" },
      blockedReason: null,
    })
  } finally {
    await rm(other, { recursive: true, force: true })
  }
})
