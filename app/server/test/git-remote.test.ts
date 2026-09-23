import { expect, test } from "vitest"
import { createApp } from "../src/app.js"
import { projectGraphRoutes } from "../src/interfaces/http/project-graph.js"

test("Git graph exposes Fetch but not Pull or Push", async () => {
  const routes = projectGraphRoutes({
    busy: () => false,
    image: async () => ({ before: null, after: null }),
    history: async () => ({ commits: [], refs: [], hasMore: false }),
    diff: async () => ({ available: true, patch: "", omitted: [] }),
    fetch: async () => ({ remotes: ["origin"] }),
  })
  expect((await routes.request("/projects/p/git/fetch", { method: "POST" })).status).toBe(200)
  for (const action of ["pull", "push"]) {
    expect((await routes.request(`/projects/p/git/${action}`, { method: "POST" })).status).toBe(404)
  }
  expect((await routes.request("/projects/p/git/graph")).status).toBe(200)
})

test("커밋 이미지 API가 비교 경로를 전달하고 잘못된 경로·리비전을 거부한다", async () => {
  const calls: unknown[] = []
  const routes = createApp({
    projectGraph: {
      image: async (
        ...args: Parameters<import("../src/core/types/git-graph.js").ProjectGraph["image"]>
      ) => {
        calls.push(args)
        return { before: null, after: null }
      },
      history: async () => ({ commits: [], refs: [], hasMore: false }),
      diff: async () => ({ available: true, patch: "", omitted: [] }),
      fetch: async () => ({ remotes: [] }),
    },
  } as never)
  const query = {
    path: "new.svg",
    oldPath: "old.svg",
    before: "a".repeat(40),
    after: "b".repeat(40),
  }
  expect(
    (await routes.request(`/api/projects/p/git/image?${new URLSearchParams(query)}`)).status,
  ).toBe(200)
  expect(calls).toEqual([["p", query]])
  for (const invalid of [
    { path: "../image.svg" },
    { oldPath: ".git/config" },
    { after: "HEAD" },
    { path: "code.ts" },
  ]) {
    expect(
      (
        await routes.request(
          `/api/projects/p/git/image?${new URLSearchParams({ ...query, ...invalid })}`,
        )
      ).status,
    ).toBe(400)
  }
  expect(calls).toHaveLength(1)
})
