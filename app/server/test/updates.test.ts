import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"

test("업데이트 조회는 캐시를 반환하고 명시적 확인만 레지스트리를 조회한다", async () => {
  const state = {
    currentVersion: "0.2.0",
    version: null,
    busy: false,
    error: null,
    checkedAt: null,
  }
  const check = vi.fn(async () => ({ ...state, version: "0.3.0" }))
  const app = createApp({ updates: { status: () => state, check } } as never)
  const response = await app.request("/api/updates")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(state)
  expect(check).not.toHaveBeenCalled()
  const checked = await app.request("/api/updates/check", { method: "POST" })
  expect(checked.status).toBe(200)
  expect(await checked.json()).toMatchObject({ version: "0.3.0" })
  expect(check).toHaveBeenCalledTimes(1)
})

test("외부 페이지는 로컬 앱의 수동 업데이트 확인을 실행할 수 없다", async () => {
  const check = vi.fn()
  const app = createApp({ updates: { status: () => ({}), check } } as never)
  expect(
    (
      await app.request("/api/updates/check", {
        method: "POST",
        headers: { Origin: "https://example.com" },
      })
    ).status,
  ).toBe(403)
  expect(check).not.toHaveBeenCalled()
})

test("업데이트 설치는 확인한 버전을 명시한 POST만 허용한다", async () => {
  const install = vi.fn(async () => ({ accepted: true }))
  const app = createApp({ updates: { status: () => ({}), check: vi.fn(), install } } as never)
  const response = await app.request("/api/updates/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "0.3.0" }),
  })
  expect(response.status).toBe(200)
  expect(install).toHaveBeenCalledWith("0.3.0")
  expect(
    (
      await app.request("/api/updates/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(400)
})
