import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { createNativeDirectoryPicker } from "../src/adapters/desktop/directory-picker.js"
import { createDirectoryPicker } from "../src/workflows/directory-picker.js"

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("native selection preserves spaces and Unicode and validates the returned directory", async () => {
  const path = await mkdtemp(join(tmpdir(), "선택 project "))
  temporary.push(path)
  const execute = vi.fn(async (_file: string, _args: string[], _signal: AbortSignal) => ({
    stdout: `${JSON.stringify(path)}\n`,
    exitCode: 0,
  }))
  const picker = createNativeDirectoryPicker({ platform: "darwin", execute })
  expect(await picker.pick(new AbortController().signal)).toBe(path)
  expect(execute.mock.calls[0]?.[0]).toBe("/usr/bin/osascript")
})

test("native cancellation is separate from process failure and malformed responses", async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ stdout: "null\n", exitCode: 0 })
    .mockResolvedValueOnce({ stdout: "", exitCode: 1 })
    .mockResolvedValueOnce({ stdout: '"relative/path"', exitCode: 0 })
  const picker = createNativeDirectoryPicker({ platform: "darwin", execute })
  const signal = new AbortController().signal
  expect(await picker.pick(signal)).toBeNull()
  await expect(picker.pick(signal)).rejects.toMatchObject({ code: "directory_picker_failed" })
  await expect(picker.pick(signal)).rejects.toMatchObject({ code: "directory_picker_failed" })
})

test("headless Linux never launches a native process", async () => {
  const execute = vi.fn()
  const picker = createNativeDirectoryPicker({ platform: "linux", env: {}, execute })
  await expect(picker.pick(new AbortController().signal)).rejects.toMatchObject({
    code: "directory_picker_unavailable",
  })
  expect(execute).not.toHaveBeenCalled()
})

test("one dialog is admitted at a time and shutdown aborts the pending dialog", async () => {
  const adapter = {
    pick: vi.fn(
      (signal: AbortSignal) =>
        new Promise<null>((resolve) =>
          signal.addEventListener("abort", () => resolve(null), { once: true }),
        ),
    ),
  }
  const picker = createDirectoryPicker(adapter)
  const pending = picker.pick()
  await expect(picker.pick()).rejects.toMatchObject({ code: "directory_picker_busy" })
  await picker.close()
  expect(await pending).toBeNull()
  await expect(picker.pick()).rejects.toMatchObject({ code: "closing" })
})

test("Linux picker cancellation, missing executable and timeouts remain distinct", async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ stdout: "", exitCode: 1 })
    .mockResolvedValueOnce({ stdout: "", code: "ENOENT" })
    .mockResolvedValueOnce({ stdout: "", exitCode: 1, timedOut: true })
  const picker = createNativeDirectoryPicker({ platform: "linux", env: { DISPLAY: ":1" }, execute })
  const signal = new AbortController().signal
  expect(await picker.pick(signal)).toBeNull()
  await expect(picker.pick(signal)).rejects.toMatchObject({ code: "directory_picker_unavailable" })
  await expect(picker.pick(signal)).rejects.toMatchObject({ code: "directory_picker_failed" })
})

test("client cancellation is forwarded and releases admission after completion", async () => {
  const adapter = {
    pick: vi.fn(
      (signal: AbortSignal) =>
        new Promise<null>((resolve) =>
          signal.addEventListener("abort", () => resolve(null), { once: true }),
        ),
    ),
  }
  const picker = createDirectoryPicker(adapter)
  const controller = new AbortController()
  const first = picker.pick(controller.signal)
  controller.abort()
  expect(await first).toBeNull()
  const second = picker.pick()
  await picker.close()
  expect(await second).toBeNull()
  expect(adapter.pick).toHaveBeenCalledTimes(2)
})
