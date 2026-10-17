import assert from "node:assert/strict"
import { test } from "node:test"
import { waitForPublication } from "./publication.mjs"

const expected = "a".repeat(40)
const newer = "b".repeat(40)
const old = "c".repeat(40)
const marker = (commit = expected) => ({
  repository: "https://github.com/wo658/redpact.git",
  ref: "refs/heads/main",
  commit,
})
function options(markers = [marker()]) {
  let calls = 0
  const urls: string[] = []
  return {
    expected,
    attempts: 3,
    pause: async () => {},
    log: () => {},
    accepts: async (sha: string) => sha === expected || sha === newer,
    fetch: async (url: URL) => {
      urls.push(url.href)
      if (url.pathname === "/docs-source.json") {
        const value = markers[Math.min(calls++, markers.length - 1)]
        return Response.json(value)
      }
      return new Response("<html>Docs</html>", { headers: { "content-type": "text/html" } })
    },
    urls,
  }
}

test("배포 SHA와 양쪽 언어 페이지를 확인해야 성공한다", async () => {
  const input = options()
  assert.equal(await waitForPublication(input), expected)
  assert.ok(input.urls.some((url) => url.includes("/en/docs/")))
  assert.ok(input.urls.some((url) => url.includes("/ko/docs/")))
  assert.ok(input.urls.every((url) => url.includes("verification=")))
})

test("이전 배포는 기다리고 요청 커밋을 포함한 후속 배포는 허용한다", async () => {
  assert.equal(await waitForPublication(options([marker(old), marker(newer)])), newer)
})

test("지속되는 SHA 불일치는 성공으로 처리하지 않는다", async () => {
  await assert.rejects(waitForPublication(options([marker(old)])), /not confirmed.*cccc/s)
})

test("다른 저장소·브랜치와 잘못된 SHA는 거절한다", async () => {
  for (const value of [
    { ...marker(), repository: "https://github.com/other/repo.git" },
    { ...marker(), ref: "refs/heads/other" },
    { ...marker(), commit: "not-a-sha" },
  ]) {
    await assert.rejects(waitForPublication(options([value])), /not confirmed/)
  }
})

test("일시적인 요청 실패 후 다음 관측에서 복구한다", async () => {
  const input = options()
  const fetch = input.fetch
  let failed = false
  input.fetch = async (url) => {
    if (!failed) {
      failed = true
      throw new Error("temporary transport failure")
    }
    return fetch(url)
  }
  assert.equal(await waitForPublication(input), expected)
})

test("SHA가 맞아도 언어 페이지가 실패하면 배포 성공으로 기록하지 않는다", async () => {
  const input = options()
  const fetch = input.fetch
  input.fetch = async (url) => {
    if (url.pathname.startsWith("/ko/")) {
      return new Response("unavailable", { status: 503 })
    }
    return fetch(url)
  }
  await assert.rejects(waitForPublication(input), /not confirmed.*503/s)
})

test("후속 SHA는 실제 Git 이력에서 요청 커밋과 main에 모두 연결되어야 한다", async () => {
  const { execFileSync } = await import("node:child_process")
  const { mkdtempSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { includesCommit } = await import("./publication.mjs")
  const directory = mkdtempSync(join(tmpdir(), "redpact-publication-"))
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  try {
    git("init", "-b", "main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "Publication test")
    git("commit", "--allow-empty", "-m", "base")
    const base = git("rev-parse", "HEAD")
    git("commit", "--allow-empty", "-m", "next docs update")
    const next = git("rev-parse", "HEAD")
    git("remote", "add", "origin", directory)
    const execute = (command: string, args: string[]) =>
      execFileSync(command, args, { cwd: directory, stdio: "pipe" })
    assert.equal(includesCommit(base, next, execute), true)
    assert.equal(includesCommit(next, base, execute), false)
    git("checkout", "-b", "unpublished")
    git("commit", "--allow-empty", "-m", "not on main")
    assert.equal(includesCommit(base, git("rev-parse", "HEAD"), execute), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
