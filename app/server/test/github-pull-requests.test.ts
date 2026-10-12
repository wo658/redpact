import { expect, test, vi } from "vitest"
import { createGitHubPullRequests, githubRepository } from "../src/adapters/github/pull-requests.js"

const target = {
  repository: "owner/repo",
  baseBranch: "main",
  branch: "feature/ui",
  head: "a".repeat(40),
  pushUrl: "git@github.com:owner/repo.git",
}
const pr = {
  number: 4,
  html_url: "https://github.com/owner/repo/pull/4",
  head: { ref: target.branch, repo: { full_name: "owner/repo" } },
  base: { ref: "main" },
}
test("GitHub origin의 SSH와 HTTPS 주소만 저장소로 해석한다", () => {
  for (const url of [
    "git@github.com:owner/repo.git",
    "https://github.com/owner/repo.git",
    "ssh://git@github.com/owner/repo.git",
  ]) {
    expect(githubRepository(url)).toBe("owner/repo")
  }
  for (const url of [
    "https://token@github.com/owner/repo",
    "https://gitlab.com/owner/repo",
    "/local/repo",
    "ext::command",
    "https://github.com/owner/repo?token=secret",
  ]) {
    expect(() => githubRepository(url)).toThrow()
  }
})
test("기본 브랜치와 기존 PR을 조회할 때 다른 fork의 PR은 선택하지 않는다", async () => {
  const run = vi.fn(async (command: string, args: string[]) => {
    if (command === "git" && args[0] === "remote") {
      return target.pushUrl
    }
    if (command === "git") {
      return "Improve UI\n"
    }
    if (args.at(-1)?.includes("/pulls?")) {
      return JSON.stringify([{ ...pr, head: { ...pr.head, repo: { full_name: "fork/repo" } } }, pr])
    }
    return JSON.stringify({ full_name: "owner/repo", default_branch: "main" })
  })
  const adapter = createGitHubPullRequests(run)
  expect(await adapter.inspect("/work", target.branch, target.head)).toEqual({
    ...target,
    title: "Improve UI",
    existing: { number: 4, url: pr.html_url },
  })
  expect(run.mock.calls.some(([, args]) => args.includes("push"))).toBe(false)
})
test("push는 확인한 SHA와 브랜치만 사용하고 force나 병합을 실행하지 않는다", async () => {
  const run = vi.fn(async () => "")
  await createGitHubPullRequests(run).push("/work", target)
  expect(run).toHaveBeenCalledWith(
    "git",
    [
      "push",
      "--porcelain",
      "--no-follow-tags",
      "--",
      target.pushUrl,
      target.head + ":refs/heads/" + target.branch,
    ],
    "/work",
  )
})
test("PR 본문은 stdin JSON으로 전달하고 성공 응답의 저장소 URL을 검증한다", async () => {
  const run = vi.fn(async () => JSON.stringify(pr))
  const adapter = createGitHubPullRequests(run)
  const body = "First line\n\nLiteral $(command) and `backticks`"
  expect(await adapter.create("/work", target, "Improve UI", body)).toEqual({
    number: 4,
    url: pr.html_url,
  })
  expect(run).toHaveBeenCalledWith(
    "gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      "repos/owner/repo/pulls",
      "--input",
      "-",
    ],
    "/work",
    JSON.stringify({ title: "Improve UI", body, head: "owner:feature/ui", base: "main" }),
  )
  run.mockResolvedValue(JSON.stringify({ ...pr, html_url: "https://evil.example/pull/4" }))
  await expect(adapter.create("/work", target, "Title", "")).rejects.toThrow("response")
})
test("fetch와 push 저장소가 다르거나 push URL이 여러 개이면 거절한다", async () => {
  const run = vi.fn(async (_command: string, args: string[]) =>
    args.includes("--push") ? "git@github.com:other/repo.git" : target.pushUrl,
  )
  await expect(
    createGitHubPullRequests(run).inspect("/work", target.branch, target.head),
  ).rejects.toThrow("same")
  run.mockResolvedValue(target.pushUrl + "\n" + target.pushUrl)
  await expect(
    createGitHubPullRequests(run).inspect("/work", target.branch, target.head),
  ).rejects.toThrow("one")
})
