import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"

test("프로젝트 Test Container를 조회하고 명시적인 실행·재실행·종료 요청만 전달한다", async () => {
  const state = { target: null, environment: null, changed: null, issue: null }
  const testContainer = {
    inspect: vi.fn(async () => state),
    start: vi.fn(async () => state),
    restart: vi.fn(async () => state),
    stop: vi.fn(async () => state),
  }
  const app = createApp({ testContainer } as never)
  const response = await app.request("/api/projects/project/test-container")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(state)
  expect(testContainer.start).not.toHaveBeenCalled()
  for (const action of ["start", "restart", "stop"] as const) {
    const response = await app.request(`/api/projects/project/test-container/${action}`, {
      method: "POST",
    })
    expect(response.status).toBe(202)
    expect(testContainer[action]).toHaveBeenCalledWith("project")
  }
  const foreign = await app.request("/api/projects/project/test-container/start", {
    method: "POST",
    headers: { Origin: "https://example.com" },
  })
  expect(foreign.status).toBe(403)
  expect(testContainer.start).toHaveBeenCalledTimes(1)
})
