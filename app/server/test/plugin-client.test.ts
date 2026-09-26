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
                  pluginId: "redpact@redpact",
                  version: "0.1.0",
                  installed: true,
                  enabled: true,
                  marketplaceName: "redpact",
                },
              ],
            }
          : [{ id: "redpact@redpact", version: "0.1.0", enabled: true, scope: "user" }]
    } else if (args[2] === "list") {
      value =
        agent === "codex"
          ? {
              marketplaces: [
                {
                  name: "redpact",
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
                name: "redpact",
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
  test(`${agent} 최신 CLI 형식과 공개 출처를 읽고 대상 마켓플레이스만 갱신한다`, async () => {
    const { calls, command } = fixture(agent)
    const read = vi.fn(async () => JSON.stringify({ name: "redpact", version: "0.2.0" }))
    const client = createPluginClient({ command, read: read as never })
    expect(await client.inspect(agent, "/custom/agent")).toMatchObject({
      version: "0.1.0",
      official: true,
      enabled: true,
      scope: "user",
    })
    await client.install(agent, "0.2.0", "/custom/agent")
    expect(calls).toContainEqual([
      "plugin",
      "marketplace",
      agent === "codex" ? "upgrade" : "update",
      "redpact",
    ])
    expect(calls.at(-1)).toEqual(
      agent === "codex"
        ? ["plugin", "add", "redpact@redpact", "--json"]
        : ["plugin", "update", "redpact@redpact", "--scope", "user"],
    )
    expect(read).toHaveBeenCalledWith(
      `/market/plugins/redpact/.${agent === "codex" ? "codex" : "claude"}-plugin/plugin.json`,
      "utf8",
    )
  })
}

test("마켓플레이스 갱신 후 버전이 달라지면 설치하지 않는다", async () => {
  const { calls, command } = fixture("codex")
  const client = createPluginClient({
    command,
    read: vi.fn(async () => JSON.stringify({ name: "redpact", version: "0.3.0" })) as never,
  })
  await expect(client.install("codex", "0.2.0", "/custom/agent")).rejects.toThrow("version changed")
  expect(calls.some((args) => args[1] === "add")).toBe(false)
})

test("비공개 출처와 다중 설치 및 불완전 CLI 결과를 구분한다", async () => {
  const command = vi.fn(async () => ({
    stdout: JSON.stringify({
      installed: [
        {
          pluginId: "redpact@personal",
          version: "0.1.0+codex.1",
          installed: true,
          enabled: true,
          marketplaceName: "personal",
        },
      ],
    }),
    stderr: "",
  }))
  const client = createPluginClient({ command })
  expect(await client.inspect("codex")).toMatchObject({ official: false })
  expect(command).toHaveBeenCalledOnce()
  command.mockResolvedValue({
    stdout: JSON.stringify({ installed: [] }),
    stderr: "failed to list remote marketplace",
  })
  await expect(client.inspect("codex")).rejects.toThrow("incomplete")
  command.mockResolvedValue({
    stdout: JSON.stringify([
      { id: "redpact@redpact", version: "0.1.0", enabled: true, scope: "user" },
      { id: "redpact@redpact", version: "0.1.0", enabled: true, scope: "project" },
    ]),
    stderr: "",
  })
  await expect(client.inspect("claude")).rejects.toThrow("Multiple")
})
