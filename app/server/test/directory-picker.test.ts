import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"

test("directory selection returns the native path and treats cancellation as a normal result", async () => {
  const pick = vi.fn().mockResolvedValueOnce("/Users/me/한글 project ").mockResolvedValueOnce(null)
  const app = createApp({ directoryPicker: { pick } } as never)
  const selected = await app.request("/api/dialogs/directory", { method: "POST" })
  expect(selected.status).toBe(200)
  expect(await selected.json()).toEqual({ path: "/Users/me/한글 project " })
  const cancelled = await app.request("/api/dialogs/directory", { method: "POST" })
  expect(await cancelled.json()).toEqual({ path: null })
})

test("directory selection cannot be triggered by reads or foreign browser origins", async () => {
  const pick = vi.fn()
  const app = createApp({ directoryPicker: { pick } } as never)
  expect((await app.request("/api/dialogs/directory")).status).toBe(404)
  for (const headers of [
    { Origin: "https://evil.example" },
    { "Sec-Fetch-Site": "same-site" },
  ] as Record<string, string>[]) {
    expect((await app.request("/api/dialogs/directory", { method: "POST", headers })).status).toBe(
      403,
    )
  }
  expect(pick).not.toHaveBeenCalled()
})

test("unavailable desktop dialogs report an actionable failure", async () => {
  const app = createApp({} as never)
  const result = await app.request("/api/dialogs/directory", { method: "POST" })
  expect(result.status).toBe(503)
  expect(await result.json()).toMatchObject({ code: "directory_picker_unavailable" })
})
