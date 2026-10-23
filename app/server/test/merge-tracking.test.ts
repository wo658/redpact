import { expect, test, vi } from "vitest"
import { createMergeTracking } from "../src/workflows/merge-tracking.js"

function fixture() {
  const source = {
    available: true as const,
    root: "/repo",
    gitdir: "/repo/.git",
    commonGitdir: "/repo/.git",
    branch: "feature",
    revision: "source",
    dirty: false,
    changes: [],
  }
  const github = {
    merged: vi.fn(async () => ({
      number: 29,
      url: "https://github.com/example/repo/pull/29",
      mergeCommit: "squash",
    })),
  }
  const git = { inspect: vi.fn(async () => ({ ...source })), isMerged: vi.fn(async () => false) }
  const contains = vi.fn(async () => true)
  let time = 0
  const tracking = createMergeTracking({
    git,
    github,
    contains,
    revision: async () => "main-head",
    origin: async () => "https://github.com/example/repo.git",
    now: () => time,
  })
  return {
    source,
    github,
    git,
    contains,
    tracking,
    advance: () => {
      time += 31000
    },
  }
}

test("같은 head의 PR 병합 결과가 로컬 main에 있으면 squash 작업을 병합으로 인식한다", async () => {
  const { tracking, github } = fixture()
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  expect(github.merged).toHaveBeenCalledWith(
    "/repo",
    "feature",
    "source",
    "main",
    "https://github.com/example/repo.git",
  )
})

test("미커밋 변경과 기본 브랜치는 PR 조회 없이 계속 표시한다", async () => {
  const { tracking, source, github } = fixture()
  source.dirty = true
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
  source.dirty = false
  source.branch = "main"
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
  expect(github.merged).not.toHaveBeenCalled()
})

test("PR이 병합됐어도 로컬 대상에 결과가 없거나 조회가 실패하면 숨기지 않는다", async () => {
  const first = fixture()
  first.contains.mockResolvedValue(false)
  expect(await first.tracking.isMerged("/repo", "main")).toBe(false)
  const second = fixture()
  second.github.merged.mockRejectedValue(new Error("Offline"))
  expect(await second.tracking.isMerged("/repo", "main")).toBe(false)
})

test("같은 PR 조회는 짧게 공유하지만 현재 작업 상태를 매번 확인한다", async () => {
  const { tracking, github, source, advance } = fixture()
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  expect(github.merged).toHaveBeenCalledTimes(1)
  source.dirty = true
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
  source.dirty = false
  advance()
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  expect(github.merged).toHaveBeenCalledTimes(2)
})

test("PR 응답을 기다리는 동안 head가 바뀌면 이전 병합 결과로 숨기지 않는다", async () => {
  const { tracking, github, source } = fixture()
  github.merged.mockImplementation(async () => {
    source.revision = "new-source"
    return { number: 29, url: "https://github.com/example/repo/pull/29", mergeCommit: "squash" }
  })
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
})

test("브랜치 목록도 같은 PR 증거로 병합 상태를 판정하고 확인되지 않은 행을 남긴다", async () => {
  const { git, github, contains } = fixture()
  const tracking = createMergeTracking({
    git,
    github,
    contains,
    revision: async (_root, branch) => (branch === "feature" ? "source" : "main-head"),
    origin: async () => "https://github.com/example/repo.git",
    now: () => 0,
  })
  const rows = [
    { name: "main", revision: "main-head", merged: false, worktrees: [] },
    { name: "feature", revision: "source", merged: false, worktrees: [] },
  ]
  expect(await tracking.branches("/repo", rows, "main")).toEqual([
    rows[0],
    { ...rows[1], merged: true },
  ])
  expect(await tracking.branches("/repo", rows, null)).toEqual(rows)
})

test("로컬 조상 관계로 확인된 병합은 GitHub 없이 동작한다", async () => {
  const { git, github, tracking } = fixture()
  git.isMerged.mockResolvedValue(true)
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  expect(github.merged).not.toHaveBeenCalled()
})

test("PR 조회 중 대상 브랜치가 바뀌면 결과를 적용하지 않는다", async () => {
  const { git, github, contains } = fixture()
  let target = "old-main"
  const tracking = createMergeTracking({
    git,
    github,
    contains,
    revision: async () => target,
    origin: async () => "https://github.com/example/repo.git",
    now: () => 0,
  })
  github.merged.mockImplementation(async () => {
    target = "new-main"
    return { number: 29, url: "https://github.com/example/repo/pull/29", mergeCommit: "squash" }
  })
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
})

test("origin이 바뀌면 이전 저장소의 PR 캐시를 재사용하지 않는다", async () => {
  const { git, github, contains } = fixture()
  let origin = "old-repository"
  const tracking = createMergeTracking({
    git,
    github,
    contains,
    revision: async () => "main-head",
    origin: async () => origin,
    now: () => 0,
  })
  expect(await tracking.isMerged("/repo", "main")).toBe(true)
  origin = "new-repository"
  github.merged.mockResolvedValue(null as never)
  expect(await tracking.isMerged("/repo", "main")).toBe(false)
  expect(github.merged).toHaveBeenCalledTimes(2)
})

test("많은 브랜치의 원격 확인도 동시에 네 개까지만 실행한다", async () => {
  const { git } = fixture()
  let active = 0
  let maximum = 0
  const github = {
    merged: async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return null
    },
  }
  const tracking = createMergeTracking({
    git,
    github,
    contains: async () => true,
    revision: async () => "main-head",
    origin: async () => "origin",
    now: () => 0,
  })
  const rows = Array.from({ length: 12 }, (_, index) => ({
    name: `feature-${index}`,
    revision: `source-${index}`,
    merged: false,
    worktrees: [],
  }))
  expect(await tracking.branches("/repo", rows, "main")).toEqual(rows)
  expect(maximum).toBe(4)
})
