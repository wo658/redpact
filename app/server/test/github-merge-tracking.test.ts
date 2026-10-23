import { expect, test, vi } from "vitest"
import { createGitHubMergeTracking } from "../src/adapters/github/merge-tracking.js"

const head = "a".repeat(40)
const mergeCommit = "b".repeat(40)
const pr = {
  number: 29,
  html_url: "https://github.com/owner/repo/pull/29",
  merged_at: "2026-10-23T01:00:00Z",
  merge_commit_sha: mergeCommit,
  head: { ref: "feature/ui", sha: head, repo: { full_name: "owner/repo" } },
  base: { ref: "main", repo: { full_name: "owner/repo" } },
}
function fixture(response: unknown = [pr], origin = "git@github.com:owner/repo.git") {
  const run = vi.fn(async (command: string, _args: string[], _root: string) =>
    command === "git" ? origin : JSON.stringify(response),
  )
  return { run, adapter: createGitHubMergeTracking(run) }
}

test("squash와 rebase로 새 SHA가 만들어져도 정확한 원본 head의 병합 PR을 인식한다", async () => {
  const { run, adapter } = fixture()
  expect(await adapter.merged("/work", "feature/ui", head, "main")).toEqual({
    number: 29,
    url: pr.html_url,
    mergeCommit,
  })
  expect(run.mock.calls).toEqual([
    ["git", ["remote", "get-url", "--all", "origin"], "/work"],
    [
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        `repos/owner/repo/commits/${head}/pulls?per_page=100`,
      ],
      "/work",
    ],
  ])
})

test("병합 뒤 브랜치에 커밋이 추가되면 이전 PR로 병합 판정하지 않는다", async () => {
  const { adapter } = fixture()
  expect(await adapter.merged("/work", "feature/ui", "c".repeat(40), "main")).toBeNull()
})

test("닫혔지만 병합되지 않은 PR은 병합 이력이 아니다", async () => {
  const { adapter } = fixture([{ ...pr, merged_at: null, merge_commit_sha: null }])
  expect(await adapter.merged("/work", "feature/ui", head, "main")).toBeNull()
})

test.each([
  { ...pr, head: { ...pr.head, ref: "other" } },
  { ...pr, head: { ...pr.head, repo: { full_name: "fork/repo" } } },
  { ...pr, head: { ...pr.head, repo: null } },
  { ...pr, base: { ...pr.base, ref: "release" } },
  { ...pr, base: { ...pr.base, repo: { full_name: "other/repo" } } },
])("다른 브랜치·fork·대상 저장소의 PR은 제외한다 %#", async (other) => {
  const { adapter } = fixture([other])
  expect(await adapter.merged("/work", "feature/ui", head, "main")).toBeNull()
})

test.each([
  {},
  [null],
  [{ ...pr, number: -1 }],
  [{ ...pr, merge_commit_sha: "broken" }],
  [{ ...pr, html_url: "https://evil.example/owner/repo/pull/29" }],
  [{ ...pr, merged_at: "not-a-date" }],
])("잘못된 API 응답을 확정된 병합이나 정상적인 미병합으로 취급하지 않는다 %#", async (response) => {
  const { adapter } = fixture(response)
  await expect(adapter.merged("/work", "feature/ui", head, "main")).rejects.toThrow()
})

test("SHA-256 저장소와 저장소 이름의 대소문자를 지원한다", async () => {
  const longHead = "a".repeat(64)
  const longMerge = "b".repeat(64)
  const { adapter } = fixture(
    [{ ...pr, head: { ...pr.head, sha: longHead }, merge_commit_sha: longMerge }],
    "https://github.com/OWNER/REPO.git",
  )
  expect(await adapter.merged("/work", "feature/ui", longHead, "main")).toEqual({
    number: 29,
    url: "https://github.com/OWNER/REPO/pull/29",
    mergeCommit: longMerge,
  })
})

test.each([
  "https://gitlab.com/owner/repo.git",
  "/local/repo",
  "https://token@github.com/owner/repo.git",
])("지원하지 않는 origin에는 GitHub 요청을 보내지 않는다: %s", async (origin) => {
  const { run, adapter } = fixture([], origin)
  expect(await adapter.merged("/work", "feature/ui", head, "main")).toBeNull()
  expect(run).toHaveBeenCalledTimes(1)
})

test("origin URL이 여러 개이면 임의의 저장소를 선택하지 않는다", async () => {
  const { run, adapter } = fixture(
    [],
    "git@github.com:owner/repo.git\ngit@github.com:other/repo.git",
  )
  await expect(adapter.merged("/work", "feature/ui", head, "main")).rejects.toThrow()
  expect(run).toHaveBeenCalledTimes(1)
})

test("인증·오프라인·Git 조회 오류는 호출자에게 전달한다", async () => {
  const { run, adapter } = fixture()
  run.mockRejectedValueOnce(new Error("git failed"))
  await expect(adapter.merged("/work", "feature/ui", head, "main")).rejects.toThrow("git failed")
  run.mockImplementation(async (command) => {
    if (command === "git") {
      return "git@github.com:owner/repo.git"
    }
    throw new Error("offline")
  })
  await expect(adapter.merged("/work", "feature/ui", head, "main")).rejects.toThrow("offline")
})

test("빈 응답은 병합 근거 없음이며 잘못된 head SHA로 API 경로를 만들지 않는다", async () => {
  const { run, adapter } = fixture([])
  expect(await adapter.merged("/work", "feature/ui", head, "main")).toBeNull()
  run.mockClear()
  await expect(adapter.merged("/work", "feature/ui", "../../other", "main")).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

test("대기 중 origin이 달라지면 캐시가 기대한 저장소로만 조회하도록 거절한다", async () => {
  const { run, adapter } = fixture()
  await expect(
    adapter.merged("/work", "feature/ui", head, "main", "https://github.com/other/repo.git"),
  ).rejects.toThrow("Origin changed")
  expect(run.mock.calls.map(([command]) => command)).toEqual(["git"])
})
