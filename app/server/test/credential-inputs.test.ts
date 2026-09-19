import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createProjectSecretStore } from "../src/adapters/storage/project-secrets.js"
import { createApp } from "../src/app.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import { createProjectSecrets } from "../src/workflows/project-secrets.js"
import type { Services } from "../src/workflows/services.js"

test("초기 설정 카드는 요청한 키만 저장하고 MCP에는 원문을 반환하지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-inputs-"))
  try {
    const settings = settingsSchema.parse({
      tests: {
        env: {
          API_KEY: { secret: "CLOUD_KEY" },
          OTHER: { secret: "OTHER_KEY" },
          URL: "https://example.test",
        },
      },
    })
    const reader = {
      projectRoot: root,
      read: async () => ({ valid: true, file: "settings.json", issues: [], settings }),
    }
    const projectSecrets = createProjectSecrets({
      store: createProjectSecretStore(root),
      worktrees: { projectSettings: async () => reader },
      fallback: {},
    })
    const app = createApp({ settings: reader, projectSecrets } as unknown as Services)
    async function rpc(name: string, args: object) {
      const response = await app.request("/mcp", {
        method: "POST",
        headers: {
          Host: "localhost",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      })
      return (await response.json()).result
    }
    const request = await rpc("request_keys", { projectId: "project", names: ["CLOUD_KEY"] })
    expect(request?.isError).not.toBe(true)
    expect(request?._meta?.redpact?.kind).toBe("inputs")
    expect(request._meta.redpact.inputs).toEqual([{ name: "CLOUD_KEY", configured: false }])
    const token = request._meta.redpact.token
    expect(JSON.stringify(request.structuredContent)).not.toContain(token)
    const denied = await rpc("submit_key", { token, name: "OTHER_KEY", value: "do-not-save" })
    expect(denied.isError).toBe(true)
    const saved = await rpc("submit_key", {
      token,
      name: "CLOUD_KEY",
      value: "private-cloud-value",
    })
    expect(saved.isError).not.toBe(true)
    expect(JSON.stringify(saved)).not.toContain("private-cloud-value")
    expect(await projectSecrets.list("project")).toContainEqual({
      name: "CLOUD_KEY",
      configured: true,
    })
    const response = await app.request("/api/projects/project/secrets/CLOUD_KEY", {
      headers: { Host: "localhost" },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({ value: "private-cloud-value" })
    const forged = await rpc("submit_key", {
      token: "x".repeat(64),
      name: "CLOUD_KEY",
      value: "forged",
    })
    expect(forged.isError).toBe(true)
    expect(await projectSecrets.list("other-project")).toContainEqual({
      name: "CLOUD_KEY",
      configured: false,
    })
    const now = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60 * 1000)
    try {
      const expired = await rpc("submit_key", { token, name: "CLOUD_KEY", value: "expired" })
      expect(expired.isError).toBe(true)
    } finally {
      clock.mockRestore()
    }
    expect(await projectSecrets.value("project", "CLOUD_KEY")).toEqual({
      value: "private-cloud-value",
    })
    const undeclared = await app.request("/api/projects/project/secrets/UNDECLARED", {
      headers: { Host: "localhost" },
    })
    expect(undeclared.status).toBe(404)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
