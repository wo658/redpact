import { expect, test } from "vitest"
import { runAgentCli } from "../src/interfaces/cli/commands.js"

function harness(replies: unknown[] = [{}]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const output: string[] = []
  return {
    calls,
    output,
    io: {
      cwd: "/checkout",
      env: {},
      stdout: (s: string) => output.push(s),
      stderr: () => {},
      stdin: async () => "[]",
      fetch: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return Response.json(replies.shift() ?? {})
      },
      write: async () => {},
      open: async () => {},
      now: () => 0,
      sleep: async () => {},
    },
  }
}
test("workspace targets cwd without connecting", async () => {
  const h = harness()
  expect(await runAgentCli(["workspace", "status", "--json"], h.io)).toBe(0)
  expect(h.calls[0]?.url).toBe("http://127.0.0.1:54318/api/workspace-status?path=%2Fcheckout")
})
test("patch forwards revision and exact operations", async () => {
  const h = harness()
  const patch = [{ op: "add", path: "/tests/timeoutMs", value: 180000 }]
  expect(
    await runAgentCli(
      [
        "settings",
        "patch",
        "--scope",
        "project",
        "--revision",
        "abc",
        "--patch",
        JSON.stringify(patch),
        "--json",
      ],
      h.io,
    ),
  ).toBe(0)
  expect(JSON.parse(String(h.calls[0]?.init?.body))).toEqual({
    scope: "project",
    path: "/checkout",
    revision: "abc",
    patch,
  })
})
test("rejects unsupported kind options before HTTP", async () => {
  const h = harness()
  expect(
    await runAgentCli(["tests", "run", "--kind", "unit", "--test", "a.ts", "--json"], h.io),
  ).toBe(2)
  expect(h.calls).toHaveLength(0)
})
test("wait returns approval immediately", async () => {
  const h = harness([{ kind: "unit", id: "review", state: "awaiting_approval" }])
  expect(await runAgentCli(["tests", "run", "--kind", "unit", "--wait", "--json"], h.io)).toBe(4)
  expect(h.calls).toHaveLength(1)
})
test("failed historical reads still succeed", async () => {
  const h = harness([{ state: "finished", outcome: "failed" }])
  expect(await runAgentCli(["runs", "show", "--kind", "unit", "--id", "run", "--json"], h.io)).toBe(
    0,
  )
})

test("Playwright viewport maps explicit dimensions to the existing schema", async () => {
  const h = harness()
  expect(
    await runAgentCli(
      [
        "tests",
        "run",
        "--kind",
        "playwright",
        "--target",
        "functional",
        "--viewport",
        "1280x720",
        "--json",
      ],
      h.io,
    ),
  ).toBe(0)
  expect(JSON.parse(String(h.calls[0]?.init?.body)).viewport).toEqual({ width: 1280, height: 720 })
})
test("invalid wait deadlines reject before submitting execution", async () => {
  const h = harness([{ state: "awaiting_approval" }])
  expect(
    await runAgentCli(
      ["tests", "run", "--kind", "unit", "--wait", "--wait-timeout", "bad", "--json"],
      h.io,
    ),
  ).toBe(2)
  expect(h.calls).toHaveLength(0)
})
test("waiting maps completed failure and cleanup failure separately", async () => {
  for (const [cleanup, code] of [
    ["complete", 3],
    ["failed", 7],
  ] as const) {
    const h = harness([
      {
        kind: "unit",
        id: "run",
        state: "finished",
        outcome: "failed",
        cleanup: { state: cleanup },
      },
    ])
    expect(
      await runAgentCli(["runs", "wait", "--kind", "unit", "--id", "run", "--json"], h.io),
    ).toBe(code)
  }
})
test("Integration 정리 실패는 테스트 성공과 실패보다 우선하는 종료 코드를 반환한다", async () => {
  for (const outcome of ["passed", "failed"]) {
    const record = {
      kind: "integration",
      id: "run",
      state: "finished",
      outcome,
      cleanup: { state: "stop_failed", issues: ["Container removal failed"] },
    }
    const h = harness([record])
    expect(
      await runAgentCli(["runs", "wait", "--kind", "integration", "--id", "run", "--json"], h.io),
    ).toBe(7)
    expect(JSON.parse(h.output.join("")).data).toEqual(record)
  }
})
test("client deadline never cancels server execution", async () => {
  const h = harness([
    { kind: "unit", id: "run", state: "running" },
    { kind: "unit", id: "run", state: "running" },
  ])
  let now = 0
  h.io.now = () => now
  h.io.sleep = async (ms?: number) => {
    now += ms ?? 500
  }
  expect(
    await runAgentCli(
      ["runs", "wait", "--kind", "unit", "--id", "run", "--wait-timeout", "0.5", "--json"],
      h.io,
    ),
  ).toBe(5)
  expect(h.calls.every((call) => call.init?.method === "GET")).toBe(true)
  expect(h.output.join("")).toContain('"executionCancelled":false')
})
test("mutation conflict emits a stable code and does not retry", async () => {
  const h = harness()
  h.io.fetch = async (url, init) => {
    h.calls.push({ url, init })
    return Response.json({ code: "settings_conflict" }, { status: 409 })
  }
  expect(
    await runAgentCli(
      ["settings", "patch", "--scope", "instance", "--revision", "old", "--patch", "[]", "--json"],
      h.io,
    ),
  ).toBe(6)
  expect(h.calls).toHaveLength(1)
  expect(JSON.parse(h.output[0] ?? "{}").error.code).toBe("CONFLICT")
})
test("patch stdin does not echo supplied values", async () => {
  const h = harness([{ revision: "new" }])
  h.io.stdin = async () =>
    JSON.stringify([{ op: "add", path: "/tests/env/TOKEN", value: "private-value" }])
  expect(
    await runAgentCli(
      ["settings", "patch", "--scope", "project", "--revision", "old", "--patch-stdin", "--json"],
      h.io,
    ),
  ).toBe(0)
  expect(h.output.join("")).not.toContain("private-value")
})
test("no Git or general file operations are accepted", async () => {
  for (const args of [
    ["git", "status"],
    ["files", "read", "--file", "a"],
  ]) {
    const h = harness()
    expect(await runAgentCli([...args, "--json"], h.io)).toBe(2)
    expect(h.calls).toHaveLength(0)
  }
})

test.each([
  "assertion_failed",
  "collection_error",
  "environment_error",
  "execution_error",
  "configuration_error",
  "interrupted",
  "unknown",
])("waiting preserves unsuccessful outcome %s", async (outcome) => {
  const h = harness([
    { kind: "integration", id: "run", state: "finished", outcome, cleanup: { state: "complete" } },
  ])
  expect(
    await runAgentCli(["runs", "wait", "--kind", "integration", "--id", "run", "--json"], h.io),
  ).toBe(3)
})
test("invalid settings validation retains diagnostics with input failure", async () => {
  const h = harness([{ valid: false, issues: [{ message: "Missing services" }] }])
  expect(await runAgentCli(["settings", "validate", "--scope", "project", "--json"], h.io)).toBe(2)
  expect(h.output.join("")).toContain("Missing services")
})
test("bare open opens full app without requiring a connected cwd", async () => {
  const h = harness()
  let opened = ""
  h.io.open = async (url?: string) => {
    opened = url ?? ""
  }
  expect(await runAgentCli(["open", "--json"], h.io)).toBe(0)
  expect(opened).toBe("http://127.0.0.1:54318/")
  expect(h.calls).toHaveLength(0)
})

test("explicit project connection also binds its existing checkout", async () => {
  const h = harness([{ id: "project" }, { id: "worktree", projectId: "project" }])
  expect(await runAgentCli(["projects", "connect", "--path", "/checkout", "--json"], h.io)).toBe(0)
  expect(
    h.calls.map((call) => [new URL(call.url).pathname, JSON.parse(String(call.init?.body))]),
  ).toEqual([
    ["/api/projects", { path: "/checkout" }],
    ["/api/projects/project/worktrees", { path: "/checkout" }],
  ])
  expect(JSON.parse(h.output[0] ?? "{}").data).toEqual({ id: "project" })
})
