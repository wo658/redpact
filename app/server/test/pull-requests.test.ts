import { expect, test, vi } from "vitest"
import { createPullRequests } from "../src/workflows/pull-requests.js"

function fixture() {
  const source = {
    root: "/work",
    commonGitdir: "/repo/.git",
    branch: "feature/ui",
    head: "a".repeat(40),
    revision: "revision-1",
    dirty: false,
    blockedReason: null,
    files: [],
    staged: { available: true, patch: "", omitted: [] },
    unstaged: { available: true, patch: "", omitted: [] },
  }
  const target = {
    repository: "owner/repo",
    baseBranch: "main",
    branch: source.branch,
    head: source.head,
    pushUrl: "git@github.com:owner/repo.git",
    title: "Improve UI",
    existing: null,
  }
  const git = { inspect: vi.fn(async () => source) }
  const github = {
    connection: vi.fn(async () => ({ login: "owner", cliPath: "/opt/homebrew/bin/gh" })),
    inspect: vi.fn(async () => target),
    push: vi.fn(async () => {}),
    find: vi.fn(async () => null as { number: number; url: string } | null),
    create: vi.fn(async () => ({ number: 3, url: "https://github.com/owner/repo/pull/3" })),
  }
  const service = createPullRequests({
    git,
    github,
    worktrees: { resolve: async () => ({ worktree: { checkoutRoot: "/work" } }) },
  })
  return { service, source, target, git, github }
}

test("PR 준비는 브랜치와 원격 대상을 보여주고 push나 발행을 하지 않는다", async () => {
  const { service, target, github } = fixture()
  expect(await service.inspect("w1")).toEqual({ ...target, revision: "revision-1" })
  expect(github.push).not.toHaveBeenCalled()
  expect(github.create).not.toHaveBeenCalled()
})

test("PR 발행은 확인한 SHA를 push한 다음 요청을 만들고 병합하지 않는다", async () => {
  const { service, github } = fixture()
  const inspected = await service.inspect("w1")
  const { existing: _, ...input } = inspected
  await expect(service.publish("w1", { ...input, body: "Reviewed changes" })).resolves.toEqual({
    number: 3,
    url: "https://github.com/owner/repo/pull/3",
  })
  expect(github.push).toHaveBeenCalledWith("/work", inspected)
  expect(github.push.mock.invocationCallOrder[0]).toBeLessThan(
    github.create.mock.invocationCallOrder[0],
  )
})

test("기존 PR은 중복 생성하지 않고 push 후 같은 PR을 반환한다", async () => {
  const { service, github } = fixture()
  const { existing: _, ...input } = await service.inspect("w1")
  github.find.mockResolvedValue({ number: 2, url: "https://github.com/owner/repo/pull/2" })
  expect((await service.publish("w1", { ...input, body: "" })).number).toBe(2)
  expect(github.create).not.toHaveBeenCalled()
})

test("미커밋 변경이나 확인 이후 달라진 대상은 원격 쓰기 전에 거절한다", async () => {
  const { service, source, target, github } = fixture()
  const { existing: _, ...input } = await service.inspect("w1")
  source.dirty = true
  await expect(service.publish("w1", { ...input, body: "" })).rejects.toThrow("Commit")
  source.dirty = false
  target.baseBranch = "release"
  await expect(service.publish("w1", { ...input, body: "" })).rejects.toThrow("changed")
  expect(github.push).not.toHaveBeenCalled()
})

test("기본 브랜치 자체는 PR용으로 push하지 않는다", async () => {
  const { service, target, github } = fixture()
  target.baseBranch = target.branch
  await expect(service.inspect("w1")).rejects.toThrow("default branch")
  expect(github.push).not.toHaveBeenCalled()
})

test("발행 응답을 잃어도 기존 PR 조회로 결과를 복구한다", async () => {
  const { service, github } = fixture()
  const { existing: _, ...input } = await service.inspect("w1")
  github.create.mockRejectedValue(new Error("response lost"))
  github.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
    number: 3,
    url: "https://github.com/owner/repo/pull/3",
  })
  expect((await service.publish("w1", { ...input, body: "" })).number).toBe(3)
})

test("중복 발행을 차단하고 종료는 진행 중인 원격 작업을 기다린다", async () => {
  const { service, github } = fixture()
  const { existing: _, ...input } = await service.inspect("w1")
  let release!: () => void
  github.push.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const first = service.publish("w1", { ...input, body: "" })
  await vi.waitFor(() => expect(service.busy()).toBe(true))
  await expect(service.publish("w1", { ...input, body: "" })).rejects.toThrow("running")
  let closed = false
  const closing = service.close().then(() => {
    closed = true
  })
  expect(closed).toBe(false)
  release()
  await first
  await closing
  expect(service.busy()).toBe(false)
  await expect(service.publish("w1", { ...input, body: "" })).rejects.toThrow("stopping")
})

test("원격 조회 중 체크아웃이 바뀌면 push 전에 다시 확인하여 거절한다", async () => {
  const { service, source, github } = fixture()
  const { existing: _, ...input } = await service.inspect("w1")
  github.inspect.mockImplementationOnce(async () => {
    const target = { ...input, existing: null }
    source.revision = "revision-2"
    return target
  })
  await expect(service.publish("w1", { ...input, body: "" })).rejects.toThrow("changed")
  expect(github.push).not.toHaveBeenCalled()
})
