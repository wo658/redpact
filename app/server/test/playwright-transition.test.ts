import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

test("스토리보드 실행과 설정 API를 완전히 제거한다", async () => {
  const app = createApp({} as Services)
  for (const path of [
    "/api/storyboard/schema",
    "/api/worktrees/example/storyboard",
    "/api/projects/example/storyboard/configuration",
  ]) {
    expect((await app.request(path)).status).toBe(404)
  }
})

test("같은 프로젝트 설정에 실제 앱 대상 Playwright 실행을 선언한다", () => {
  const parsed = parseSettings(
    JSON.stringify({
      composeFiles: [],
      playwright: {
        targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
        directory: "ui-tests",
        service: "app",
        port: 3000,
      },
    }),
    "settings.json",
  )
  expect(parsed.valid).toBe(true)
  expect(parsed.settings).toMatchObject({
    playwright: {
      targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
      directory: "ui-tests",
      service: "app",
      port: 3000,
      viewport: { width: 1920, height: 1080 },
    },
  })
})

test("잘못된 캡처 입력은 실행하지 않고 400으로 거부한다", async () => {
  const { playwrightRoutes } = await import("../src/interfaces/http/playwright.js")
  const { Hono } = await import("hono")
  let started = false
  const routes = playwrightRoutes(
    {} as never,
    {
      start: async () => {
        started = true
      },
    } as never,
  )
  const app = new Hono().route("/", routes)
  const response = await app.request("/worktrees/w/playwright/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewport: { width: 10, height: 840 } }),
  })
  expect(response.status).toBe(400)
  expect(started).toBe(false)
})

test("선언된 Playwright 앱 서비스가 Compose에 없으면 공통 설정 검증에서 거부한다", async () => {
  const { planContainers } = await import("../src/core/container-plan.js")
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  const settings = settingsSchema.parse({
    composeFiles: ["compose.yaml"],
    playwright: {
      targets: { captures: { purpose: "capture", testMatch: ["**/*.spec.{ts,js,mts,mjs}"] } },
      service: "missing",
      port: 3000,
    },
  })
  const result = planContainers(settings, { services: { app: {} } })
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "playwright.service", code: "unknown_reference" }),
    ]),
  )
})

test("프로젝트 기록은 삭제된 워크트리의 캡처도 최신순으로 보존하고 다른 프로젝트를 제외한다", async () => {
  const { createCaptures } = await import("../src/workflows/playwright.js")
  const { playwrightRoutes } = await import("../src/interfaces/http/playwright.js")
  const records = [
    { id: "old", projectId: "p", worktreeId: "deleted", createdAt: "2026-09-01" },
    { id: "other", projectId: "other", worktreeId: "w", createdAt: "2026-09-11" },
    { id: "new", projectId: "p", worktreeId: "current", createdAt: "2026-09-10" },
  ]
  const captures = createCaptures({ list: () => records } as never)
  const app = playwrightRoutes(captures, {} as never)
  const response = await app.request("/projects/p/playwright-runs")
  expect(response.status).toBe(200)
  expect((await response.json()).runs.map((r: { id: string }) => r.id)).toEqual(["new", "old"])
})

test("캡처와 기능 검증 목적을 선언하고 지정하지 않은 목적은 거부한다", () => {
  const playwright = {
    directory: "browser",
    service: "app",
    port: 3000,
    targets: {
      screens: { purpose: "capture", testMatch: ["screens/**/*.ts"] },
      checks: { purpose: "functional", testMatch: ["checks/**/*.spec.ts"] },
    },
  }
  expect(parseSettings(JSON.stringify({ playwright }), "settings.json").valid).toBe(true)
  const invalid = { ...playwright, targets: { screens: { testMatch: ["**/*.ts"] } } }
  expect(parseSettings(JSON.stringify({ playwright: invalid }), "settings.json").valid).toBe(false)
})
