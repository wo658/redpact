import { expect, test, vi } from "vitest"
import { newerRelease } from "../src/core/updates.js"
import { createUpdates } from "../src/workflows/updates.js"

test("정식 설치는 beta를 제안하지 않고 beta 설치는 정식 전환과 beta 숫자를 비교한다", () => {
  expect(newerRelease("0.2.0", { latest: "0.2.0", beta: "0.3.0-beta.1" })).toBeNull()
  expect(newerRelease("0.2.0-beta.9", { beta: "0.2.0-beta.10" })).toBe("0.2.0-beta.10")
  expect(newerRelease("0.2.0-beta.9", { latest: "0.2.0", beta: "0.2.0-beta.10" })).toBe("0.2.0")
  expect(newerRelease("0.3.0", { latest: "0.2.0" })).toBeNull()
  expect(() => newerRelease("0.2.0", {})).toThrow("No release channel")
  expect(() => newerRelease("0.2.0", { latest: "garbage" })).toThrow("Invalid registry")
})

test("중복 확인을 합치고 조회 실패를 최신 상태로 바꾸지 않는다", async () => {
  let resolve!: (tags: Record<string, string>) => void
  const readTags = vi.fn(
    () =>
      new Promise<Record<string, string>>((done) => {
        resolve = done
      }),
  )
  const updates = createUpdates({
    currentVersion: "0.2.0",
    supported: true,
    readTags,
    now: () => "2026-09-22T00:00:00Z",
  })
  const first = updates.check()
  const second = updates.check()
  await Promise.resolve()
  expect(readTags).toHaveBeenCalledTimes(1)
  expect(updates.status().busy).toBe(true)
  resolve({ latest: "0.3.0" })
  expect(await first).toEqual(await second)
  readTags.mockRejectedValueOnce(new Error("Offline"))
  expect(await updates.check()).toMatchObject({ version: "0.3.0", error: "Offline", busy: false })
  readTags.mockResolvedValueOnce({ latest: "0.2.0" })
  expect(await updates.check()).toMatchObject({ version: null, error: null })
  updates.close()
})

test("개발·데스크톱 서버는 npm 조회를 시작하지 않는다", async () => {
  const readTags = vi.fn()
  const updates = createUpdates({
    currentVersion: "0.2.0",
    supported: false,
    readTags,
    now: () => "now",
  })
  updates.start()
  expect(await updates.check()).toMatchObject({ supported: false, version: null })
  expect(readTags).not.toHaveBeenCalled()
  updates.close()
})

test("확인된 버전만 한 번 설치하고 작업 보류 후 다시 시도할 수 있다", async () => {
  const requestInstall = vi.fn(async () => {})
  const updates = createUpdates({
    currentVersion: "0.2.0",
    supported: true,
    readTags: async () => ({ latest: "0.3.0" }),
    now: () => "now",
    requestInstall,
  })
  await expect(updates.install("0.3.0")).rejects.toThrow("Update state changed")
  await updates.check()
  await expect(updates.install("9.0.0")).rejects.toThrow("Update state changed")
  expect(await updates.install("0.3.0")).toEqual({ accepted: true })
  await expect(updates.install("0.3.0")).rejects.toThrow("Update state changed")
  expect(requestInstall).toHaveBeenCalledTimes(1)
  updates.installationFailed("Active work deferred the update")
  expect(updates.status()).toMatchObject({
    busy: false,
    installError: "Active work deferred the update",
  })
  await updates.install("0.3.0")
  expect(requestInstall).toHaveBeenCalledTimes(2)
  updates.close()
})
