import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { fetchRemotes } from "../src/adapters/git/fetch.js"
import { createApp } from "../src/app.js"
import { createProjectGraph } from "../src/workflows/project-graph.js"

test("Fetch HTTP 요청은 명시적인 POST만 실행한다", async () => {
  let calls = 0
  const app = createApp({
    projectGraph: {
      fetch: async () => {
        calls++
        return { remotes: ["origin"] }
      },
    },
  } as never)
  expect((await app.request("/api/projects/p/git/fetch")).status).toBe(404)
  expect(calls).toBe(0)
  const result = await app.request("/api/projects/p/git/fetch", { method: "POST" })
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ remotes: ["origin"] })
  expect(calls).toBe(1)
})

test("Fetch는 여러 remote를 갱신하고 위험한 설정 refspec·prune·tag 동작을 무시한다", async () => {
  const base = await mkdtemp(join(tmpdir(), "redpact-fetch-"))
  const git = (root: string, ...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  try {
    const remote = join(base, "remote")
    const local = join(base, "local")
    execFileSync("git", ["init", "-q", "-b", "main", remote])
    git(remote, "config", "user.name", "Test")
    git(remote, "config", "user.email", "test@example.com")
    git(remote, "commit", "--allow-empty", "-qm", "base")
    execFileSync("git", ["clone", "-q", remote, local])
    const head = git(local, "rev-parse", "HEAD")
    git(remote, "commit", "--allow-empty", "-qm", "new remote commit")
    const next = git(remote, "rev-parse", "HEAD")
    git(remote, "tag", "new-tag")
    git(local, "remote", "add", "upstream", remote)
    git(local, "config", "remote.origin.fetch", "+refs/heads/*:refs/heads/*")
    git(local, "config", "fetch.prune", "true")
    git(local, "config", "remote.origin.tagOpt", "--tags")
    git(local, "update-ref", "refs/remotes/origin/retained", head)
    await writeFile(join(local, "dirty"), "staged")
    git(local, "add", "dirty")
    const index = await readFile(join(local, ".git/index"))
    await writeFile(join(local, "dirty"), "working")
    expect(await fetchRemotes(join(local, ".git"))).toEqual({ remotes: ["origin", "upstream"] })
    expect(git(local, "rev-parse", "refs/remotes/origin/main")).toBe(next)
    expect(git(local, "rev-parse", "refs/remotes/upstream/main")).toBe(next)
    expect(git(local, "rev-parse", "refs/remotes/origin/retained")).toBe(head)
    expect(git(local, "rev-parse", "HEAD")).toBe(head)
    expect(git(local, "tag", "--list")).toBe("")
    expect(await readFile(join(local, ".git/index"))).toEqual(index)
    expect(await readFile(join(local, "dirty"), "utf8")).toBe("working")
    git(local, "remote", "set-url", "origin", join(base, "missing"))
    await expect(fetchRemotes(join(local, ".git"))).rejects.toMatchObject({
      code: "git_fetch_failed",
    })
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test("동일 저장소의 중복 Fetch를 거부하고 실패 후 잠금을 해제한다", async () => {
  let reject!: (error: Error) => void
  const core = createProjectGraph({
    image: async () => ({ before: null, after: null }),
    store: { getProject: () => ({ location: { kind: "git", commonGitdir: "/repo/.git" } }) },
    fetch: () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  } as never)
  expect(typeof core.fetch).toBe("function")
  const pending = core.fetch("p")
  await expect(core.fetch("another-project-id")).rejects.toMatchObject({ code: "worktree_busy" })
  reject(new Error("offline"))
  await expect(pending).rejects.toThrow("offline")
  const retry = core.fetch("p")
  reject(new Error("retry reached adapter"))
  await expect(retry).rejects.toThrow("retry reached adapter")
})
