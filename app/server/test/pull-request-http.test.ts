import { expect, test, vi } from "vitest"
import { pullRequestRoutes } from "../src/interfaces/http/pull-requests.js"

test("PR HTTP는 읽기와 발행을 분리하고 확인된 대상과 제목을 검증한다", async () => {
  const inspection = {
    repository: "owner/repo",
    baseBranch: "main",
    branch: "feature/ui",
    head: "a".repeat(40),
    revision: "revision-1",
    pushUrl: "https://github.com/owner/repo.git",
    title: "Improve UI",
    existing: null,
  }
  const publish = vi.fn(async () => ({ number: 4, url: "https://github.com/owner/repo/pull/4" }))
  const routes = pullRequestRoutes({
    connection: async () => ({ login: "owner", cliPath: "/opt/homebrew/bin/gh" }),
    inspect: async () => inspection,
    publish,
    busy: () => false,
    close: async () => {},
  })
  const response = await routes.request("/worktrees/w1/pull-request")
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual(inspection)
  expect(publish).not.toHaveBeenCalled()
  const { existing: _, ...input } = inspection
  const post = (body: unknown) =>
    routes.request("/worktrees/w1/pull-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  expect((await post({ ...input, title: "", body: "" })).status).toBe(400)
  expect((await post({ ...input, body: "", force: true })).status).toBe(400)
  expect(publish).not.toHaveBeenCalled()
  expect((await post({ ...input, body: "Reviewed changes" })).status).toBe(200)
  expect(publish).toHaveBeenCalledWith("w1", { ...input, body: "Reviewed changes" })
})
