import { expect, test, vi } from "vitest"
import { createPluginClient } from "../src/adapters/plugins/client.js"

function fixture(agent: "codex" | "claude") {
  const calls: string[][] = []
  const command = vi.fn(async (_agent: string, args: string[], cliPath?: string) => {
    expect(cliPath).toBe("/custom/agent")
    calls.push(args)
    let value: unknown = {}
    if (args[1] === "list") {
      value =
        agent === "codex"
          ? {
              installed: [
                {
                  pluginId: "redpact@personal",
                  version: "0.1.0",
                  installed: true,
                  enabled: true,
                  marketplaceName: "personal",
                },
              ],
            }
          : [{ id: "redpact@personal", version: "0.1.0", enabled: true, scope: "user" }]
    } else if (args[2] === "list") {
      value =
        agent === "codex"
          ? {
              marketplaces: [
                {
                  name: "personal",
                  root: "/market",
                  marketplaceSource: {
                    sourceType: "git",
                    source: "https://github.com/wo658/redpact.git",
                  },
                },
              ],
            }
          : [
              {
                name: "personal",
                source: "github",
                repo: "wo658/redpact",
                installLocation: "/market",
              },
            ]
    }
    return { stdout: JSON.stringify(value), stderr: "" }
  })
  return { calls, command }
}

for (const agent of ["codex", "claude"] as const) {
  test(`${agent} 최신 CLI 형식과 설치된 마켓플레이스를 읽고 대상 마켓플레이스만 갱신한다`, async () => {
    const { calls, command } = fixture(agent)
    const read = vi.fn(async (path: string) =>
      JSON.stringify(
        path.endsWith("marketplace.json")
          ? {
              plugins: [
                {
                  name: "redpact",
                  source:
                    agent === "codex"
                      ? { source: "local", path: "./custom/redpact" }
                      : "./custom/redpact",
                },
              ],
            }
          : { name: "redpact", version: "0.2.0" },
      ),
    )
    const client = createPluginClient({ command, read: read as never })
    expect(await client.inspect(agent, "/custom/agent")).toMatchObject({
      version: "0.1.0",
      supported: true,
      enabled: true,
      scope: "user",
    })
    expect(await client.latest(agent, "/custom/agent")).toBe("0.2.0")
    await client.install(agent, "0.2.0", "/custom/agent")
    expect(calls).toContainEqual([
      "plugin",
      "marketplace",
      agent === "codex" ? "upgrade" : "update",
      "personal",
    ])
    expect(calls.at(-1)).toEqual(
      agent === "codex"
        ? ["plugin", "add", "redpact@personal", "--json"]
        : ["plugin", "update", "redpact@personal", "--scope", "user"],
    )
    expect(read).toHaveBeenCalledWith(
      `/market/custom/redpact/.${agent === "codex" ? "codex" : "claude"}-plugin/plugin.json`,
      "utf8",
    )
  })
}

test("로컬 personal 마켓플레이스는 Git 갱신 없이 현재 소스를 읽고 설치한다", async () => {
  const { calls, command } = fixture("codex")
  const original = command.getMockImplementation()
  if (!original) {
    throw new Error("Missing fixture command")
  }
  command.mockImplementation(async (agent, args, cliPath) => {
    if (args[2] === "list") {
      return {
        stdout: JSON.stringify({ marketplaces: [{ name: "personal", root: "/market" }] }),
        stderr: "",
      }
    }
    return original(agent, args, cliPath)
  })
  let version = "0.2.0"
  const client = createPluginClient({
    command,
    read: vi.fn(async (path: string) =>
      JSON.stringify(
        path.endsWith("marketplace.json")
          ? {
              plugins: [{ name: "redpact", source: { source: "local", path: "./custom/redpact" } }],
            }
          : { name: "redpact", version },
      ),
    ) as never,
  })
  expect(await client.latest("codex", "/custom/agent")).toBe("0.2.0")
  version = "0.3.0"
  await expect(client.install("codex", "0.2.0", "/custom/agent")).rejects.toThrow("version changed")
  expect(calls.some((args) => args[1] === "add" || args[2] === "upgrade")).toBe(false)
  await client.install("codex", "0.3.0", "/custom/agent")
  expect(calls.at(-1)).toEqual(["plugin", "add", "redpact@personal", "--json"])
})

test("다중 설치와 불완전 CLI 목록을 성공으로 처리하지 않는다", async () => {
  const command = vi.fn(async () => ({
    stdout: JSON.stringify({ installed: [] }),
    stderr: "failed to list marketplace",
  }))
  const client = createPluginClient({ command })
  await expect(client.inspect("codex")).rejects.toThrow("incomplete")
  command.mockResolvedValue({
    stdout: JSON.stringify([
      { id: "redpact@personal", version: "0.1.0", enabled: true, scope: "user" },
      { id: "redpact@other", version: "0.1.0", enabled: true, scope: "user" },
    ]),
    stderr: "",
  })
  await expect(client.inspect("claude")).rejects.toThrow("Multiple")
})

test("확인한 마켓플레이스 출처가 바뀌면 설치 명령을 실행하지 않는다", async () => {
  const { calls, command } = fixture("codex")
  const client = createPluginClient({
    command,
    read: vi.fn(async (path: string) =>
      JSON.stringify(
        path.endsWith("marketplace.json")
          ? {
              plugins: [{ name: "redpact", source: { source: "local", path: "./custom/redpact" } }],
            }
          : { name: "redpact", version: "0.2.0" },
      ),
    ) as never,
  })
  await expect(client.install("codex", "0.2.0", "/custom/agent", "changed-source")).rejects.toThrow(
    "source changed",
  )
  expect(calls.some((args) => args[1] === "add")).toBe(false)
})
