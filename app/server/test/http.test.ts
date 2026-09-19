import { describe, expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"

describe("local HTTP boundary", () => {
  test("local clients can read health without a token", async () => {
    const app = createApp({} as never)
    const response = await app.request("/api/health")
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe("ok")
  })

  test.each(["https://example.com", "http://localhost:9999", "null"])(
    "rejects foreign Origin %s for reads, mutations and MCP",
    async (origin) => {
      const app = createApp({} as never)
      for (const path of ["/api/health", "/api/projects/id/tracking", "/mcp"]) {
        const response = await app.request(path, {
          method: path === "/api/health" ? "GET" : "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: path === "/api/health" ? undefined : "{}",
        })
        expect(response.status).toBe(403)
      }
    },
  )

  test.each(["cross-site", "same-site"])(
    "rejects %s browser requests even without Origin",
    async (site) => {
      const app = createApp({} as never)
      const response = await app.request("/api/health", { headers: { "Sec-Fetch-Site": site } })
      expect(response.status).toBe(403)
    },
  )

  test("rejects non-loopback hosts", async () => {
    const app = createApp({} as never)
    expect((await app.request("http://evil.example/api/health")).status).toBe(403)
  })

  test("same-origin mutations reach the service without credentials", async () => {
    const setTracking = vi.fn(async () => ({ id: "project" }))
    const app = createApp({ projectSettings: { update: setTracking } } as never)
    const response = await app.request("http://localhost/api/projects/project/tracking", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mainBranch: "main", hideMerged: false }),
    })
    expect(response.status).toBe(200)
    expect(setTracking).toHaveBeenCalledWith("project", { mainBranch: "main", hideMerged: false })
  })
})

test("live events are streamed under the local HTTP boundary and release watchers on disconnect", async () => {
  const close = vi.fn(async () => {})
  const subscribe = vi.fn((_roots?: unknown) => ({ ready: Promise.resolve(), close }))
  const app = createApp({ changes: { subscribe }, dataDirectory: "/runtime" } as never)
  const response = await app.request("http://localhost/api/events")
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Missing stream")
  }
  const first = await reader.read()
  expect(new TextDecoder().decode(first.value)).toContain("data: changed")
  await reader.cancel()
  await vi.waitFor(() => expect(close).toHaveBeenCalled())
  const denied = await app.request("http://localhost/api/events", {
    headers: { Origin: "https://evil.example" },
  })
  expect(denied.status).toBe(403)
  expect(subscribe).toHaveBeenCalledTimes(1)
})

test("worktree subscriptions resolve server-owned checkout and private/common Git paths", async () => {
  const close = vi.fn(async () => {})
  const subscribe = vi.fn((_roots?: unknown) => ({ ready: Promise.resolve(), close }))
  const resolve = vi.fn(async () => ({
    worktree: { checkoutRoot: "/checkout", gitdir: "/common/worktrees/one", projectId: "p1" },
  }))
  const app = createApp({
    changes: { subscribe },
    dataDirectory: "/runtime",
    worktrees: {
      resolve,
      getProject: () => ({ location: { kind: "git", commonGitdir: "/common" } }),
    },
  } as never)
  const response = await app.request("http://localhost/api/events?worktreeId=w1&path=/outside")
  expect(response.status).toBe(200)
  expect(resolve).toHaveBeenCalledWith("w1")
  expect(subscribe.mock.calls[0][0]).toEqual([
    { path: "/checkout", kind: "checkout" },
    { path: "/common/worktrees/one", kind: "git-private" },
    { path: "/common", kind: "git-shared" },
  ])
  await response.body?.cancel()
  await vi.waitFor(() => expect(close).toHaveBeenCalled())
})

test("catalog subscriptions stay limited to project records when projects are connected", async () => {
  const projects = [{ location: { kind: "git", commonGitdir: "/first/.git" } }]
  const close = vi.fn(async () => {})
  const subscribe = vi.fn((_roots: unknown, _changed: () => void) => ({
    ready: Promise.resolve(),
    close,
  }))
  const app = createApp({
    changes: { subscribe },
    dataDirectory: "/runtime",
    worktrees: { listProjects: () => projects },
  } as never)
  const response = await app.request("http://localhost/api/events")
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Missing stream")
  }
  await reader.read()
  expect(subscribe.mock.calls[0][0]).toEqual([{ path: "/runtime/projects", kind: "records" }])
  projects.push({ location: { kind: "git", commonGitdir: "/second/.git" } })
  subscribe.mock.calls[0][1]()
  await reader.read()
  expect(subscribe).toHaveBeenCalledTimes(1)
  await reader.cancel()
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
})

test("project streams follow Git checkout paths and refresh watches when the registry changes", async () => {
  const close = vi.fn(async () => {})
  const subscribe = vi.fn((_roots: unknown, _changed: (paths?: string[]) => void) => ({
    ready: Promise.resolve(),
    close,
  }))
  const paths = ["/repo", "/linked"]
  const app = createApp({
    changes: { subscribe },
    dataDirectory: "/runtime",
    worktrees: {
      checkoutPaths: async () => [...paths],
      getProject: () => ({ id: "p1", location: { kind: "git", commonGitdir: "/repo/.git" } }),
    },
  } as never)
  const response = await app.request("http://localhost/api/events?projectId=p1")
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Missing stream")
  }
  await reader.read()
  expect(subscribe.mock.calls[0][0]).toEqual([
    { path: "/runtime/projects/p1.json", kind: "records" },
    { path: "/runtime/worktrees", kind: "records" },
    { path: "/repo/.git", kind: "git" },
    { path: "/repo", kind: "checkout" },
    { path: "/linked", kind: "checkout" },
  ])
  paths.push("/new-checkout")
  subscribe.mock.calls[0][1](["/repo/.git/worktrees/new/gitdir"])
  await reader.read()
  expect(subscribe).toHaveBeenCalledTimes(2)
  expect(subscribe.mock.calls[1][0]).toContainEqual({ path: "/new-checkout", kind: "checkout" })
  expect(close).toHaveBeenCalledTimes(1)
  await reader.cancel()
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(2))
})

test("evidence subscriptions ignore other worktrees and checkout source changes", async () => {
  const close = vi.fn(async () => {})
  const subscribe = vi.fn((_roots: unknown, _changed: (paths?: string[]) => void) => ({
    ready: Promise.resolve(),
    close,
  }))
  const app = createApp({
    changes: { subscribe },
    dataDirectory: "/runtime",
    worktrees: {
      getWorktree: () => ({ id: "w1", checkoutRoot: "/checkout", projectRoot: "/checkout" }),
      resolve: async () => {
        throw new Error("Checkout has been deleted")
      },
    },
    submissions: { get: (id: string) => ({ worktreeId: id === "own" ? "w1" : "w2" }) },
  } as never)
  const response = await app.request("http://localhost/api/events?worktreeId=w1&scope=evidence")
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Missing stream")
  }
  await reader.read()
  expect(subscribe.mock.calls[0][0]).not.toContainEqual({ path: "/checkout", kind: "checkout" })
  let received = false
  const next = reader.read().then((value) => {
    received = true
    return value
  })
  expect(subscribe.mock.calls[0][0]).toContainEqual({
    path: "/checkout/.redpact",
    kind: "checkout",
  })
  subscribe.mock.calls[0][1](["/other/.redpact/selection.json"])
  subscribe.mock.calls[0][1](["/runtime/submissions/other.json"])
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(received).toBe(false)
  subscribe.mock.calls[0][1](["/runtime/submissions/own.json"])
  expect(new TextDecoder().decode((await next).value)).toContain("changed")
  const selectionChanged = reader.read()
  subscribe.mock.calls[0][1](["/checkout/.redpact/selection.json"])
  expect(new TextDecoder().decode((await selectionChanged).value)).toContain("changed")
  await reader.cancel()
})
