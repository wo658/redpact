import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import { instanceSettingsSchema } from "../src/core/instance-schema.js"

test("플러그인 확인은 명시적으로 실행하고 조회는 캐시만 반환한다", async () => {
  const state = { agents: [], busy: false, checkedAt: null }
  const check = vi.fn(async () => state)
  const install = vi.fn(async () => state)
  const app = createApp({ pluginUpdates: { status: () => state, check, install } } as never)
  const response = await app.request("/api/plugin-updates")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(state)
  expect(check).not.toHaveBeenCalled()
  expect((await app.request("/api/plugin-updates/check", { method: "POST" })).status).toBe(200)
  expect(check).toHaveBeenCalledOnce()
  expect(
    (
      await app.request("/api/plugin-updates/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "codex", version: "0.2.0" }),
      })
    ).status,
  ).toBe(200)
  expect(install).toHaveBeenCalledWith("codex", "0.2.0")
  expect(
    (
      await app.request("/api/plugin-updates/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "shell", version: "0.2.0" }),
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await app.request("/api/plugin-updates/check", {
        method: "POST",
        headers: { Origin: "https://example.com" },
      })
    ).status,
  ).toBe(403)
})

test("에이전트 CLI 설정은 절대 실행 파일 경로만 저장한다", () => {
  expect(
    instanceSettingsSchema.safeParse({
      agents: { codex: { cliPath: "/opt/bin/codex" }, claude: { cliPath: "/opt/bin/claude" } },
    }).success,
  ).toBe(true)
  expect(
    instanceSettingsSchema.safeParse({ agents: { codex: { cliPath: "codex --anything" } } })
      .success,
  ).toBe(false)
})

test("앱 버전과 무관하게 더 높은 플러그인만 갱신하고 설치 결과를 다시 읽는다", async () => {
  const { createPluginUpdates } = await import("../src/workflows/plugin-updates.js")
  let version = "0.1.0"
  const install = vi.fn(async () => {
    version = "0.2.0"
  })
  const client = {
    inspect: vi.fn(async () => ({
      version,
      enabled: true,
      scope: "user",
      id: "redpact@personal",
      sourceKey: "personal",
      supported: true,
    })),
    latest: vi.fn(async () => "0.2.0"),
    install,
  }
  const service = createPluginUpdates({
    client,
    settings: { instance: async () => ({ value: {}, issues: [] }) } as never,
    now: () => "2026-09-26T00:00:00.000Z",
  })
  await expect(service.install("codex", "0.2.0")).rejects.toThrow("Check again")
  expect((await service.check()).agents[0].status).toBe("available")
  expect(install).not.toHaveBeenCalled()
  expect((await service.install("codex", "0.2.0")).agents[0]).toMatchObject({
    status: "updated",
    currentVersion: "0.2.0",
  })
  expect(install).toHaveBeenCalledWith("codex", "0.2.0", undefined, "personal")
  expect((await service.check()).agents[0].status).toBe("current")
})

test("지원하지 않는 소스와 버전 불명은 자동 설치하지 않고 실패 후 재확인을 허용한다", async () => {
  const { createPluginUpdates } = await import("../src/workflows/plugin-updates.js")
  const client = {
    inspect: vi.fn(async () => ({
      version: "0.1.0",
      enabled: true,
      scope: "user",
      id: "redpact@personal",
      sourceKey: "personal",
      supported: false,
    })),
    latest: vi.fn(async () => "0.2.0"),
    install: vi.fn(),
  }
  const service = createPluginUpdates({
    client,
    settings: { instance: async () => ({ value: {}, issues: [] }) } as never,
    now: () => "now",
  })
  expect((await service.check()).agents[0].status).toBe("unsupported")
  expect(client.latest).not.toHaveBeenCalled()
  client.inspect.mockResolvedValue({
    version: "unknown",
    enabled: true,
    scope: "user",
    id: "redpact@personal",
    sourceKey: "personal",
    supported: true,
  })
  expect((await service.check()).agents[0].status).toBe("unsupported")
  client.inspect.mockResolvedValue({
    version: "0.1.0",
    enabled: true,
    scope: "user",
    id: "redpact@personal",
    sourceKey: "personal",
    supported: true,
  })
  await service.check()
  client.install.mockRejectedValue(new Error("Install failed"))
  expect((await service.install("codex", "0.2.0")).agents[0]).toMatchObject({
    status: "error",
    error: "Install failed",
  })
  expect((await service.check()).agents[0].status).toBe("available")
  client.install.mockResolvedValue(undefined)
  expect((await service.install("codex", "0.2.0")).agents[0].status).toBe("error")
})

test("확인 후 CLI 경로나 마켓플레이스 버전이 바뀌면 설치하지 않는다", async () => {
  const { createPluginUpdates } = await import("../src/workflows/plugin-updates.js")
  let cliPath = "/bin/codex"
  const client = {
    inspect: vi.fn(async () => ({
      version: "0.1.0",
      enabled: true,
      scope: "user",
      id: "redpact@personal",
      sourceKey: "personal",
      supported: true,
    })),
    latest: vi.fn(async () => "0.2.0"),
    install: vi.fn(),
  }
  const service = createPluginUpdates({
    client,
    settings: {
      instance: async () => ({ value: { agents: { codex: { cliPath } } }, issues: [] }),
    } as never,
    now: () => "now",
  })
  await service.check()
  cliPath = "/other/codex"
  expect((await service.install("codex", "0.2.0")).agents[0].status).toBe("error")
  expect(client.install).not.toHaveBeenCalled()
  await service.check()
  client.latest.mockResolvedValue("0.3.0")
  expect((await service.install("codex", "0.2.0")).agents[0].status).toBe("error")
  expect(client.install).not.toHaveBeenCalled()
})

test("플러그인 설치 중에는 확인 결과를 덮거나 중복 설치하지 않는다", async () => {
  const { createPluginUpdates } = await import("../src/workflows/plugin-updates.js")
  let version = "0.1.0"
  let finish = () => {}
  const client = {
    inspect: vi.fn(async () => ({
      version,
      enabled: true,
      scope: "user",
      id: "redpact@personal",
      sourceKey: "personal",
      supported: true,
    })),
    latest: vi.fn(async () => "0.2.0"),
    install: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            version = "0.2.0"
            resolve()
          }
        }),
    ),
  }
  const service = createPluginUpdates({
    client,
    settings: { instance: async () => ({ value: {}, issues: [] }) } as never,
    now: () => "now",
  })
  await service.check()
  const pending = service.install("codex", "0.2.0")
  await vi.waitFor(() => expect(client.install).toHaveBeenCalledOnce())
  const calls = client.inspect.mock.calls.length
  expect((await service.check()).busy).toBe(true)
  expect(client.inspect.mock.calls.length).toBe(calls)
  await expect(service.install("codex", "0.2.0")).rejects.toThrow("Check again")
  finish()
  expect((await pending).busy).toBe(false)
})

test("빌드 메타데이터만 다르거나 설치 버전이 더 높으면 내리지 않는다", async () => {
  const { pluginVersionStatus } = await import("../src/core/plugin-updates.js")
  expect(pluginVersionStatus("0.2.0+local.1", "0.2.0+local.2")).toBe("current")
  expect(pluginVersionStatus("0.3.0", "0.2.0")).toBe("current")
  expect(() => pluginVersionStatus("unknown", "0.2.0")).toThrow()
  expect(() => pluginVersionStatus("0.1.0", "0.2.0-beta.1")).toThrow()
})

test("Codex 재설치 버전의 시간표시가 더 최신이면 업데이트하고 이전 빌드로 내리지 않는다", async () => {
  const { pluginVersionStatus } = await import("../src/core/plugin-updates.js")
  expect(pluginVersionStatus("0.1.0+codex.20260919112208", "0.1.0+codex.20260927112208")).toBe(
    "available",
  )
  expect(pluginVersionStatus("0.1.0+codex.20260927112208", "0.1.0+codex.20260919112208")).toBe(
    "current",
  )
})
