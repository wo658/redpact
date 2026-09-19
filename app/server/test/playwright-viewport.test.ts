import { expect, test } from "vitest"

const modulePath = "../src/adapters/playwright/viewport.cjs"
const { annotate, readViewport } = await import(modulePath)
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
)

test("같은 부분 이미지도 캡처 페이지의 서로 다른 크기를 보존한다", () => {
  const mobile = annotate(png, { width: 414, height: 896 })
  const desktop = annotate(png, { width: 1920, height: 1080 })
  expect(readViewport(mobile)).toEqual({ width: 414, height: 896 })
  expect(readViewport(desktop)).toEqual({ width: 1920, height: 1080 })
  expect(mobile.equals(desktop)).toBe(false)
  expect(mobile.readUInt32BE(16)).toBe(1)
})

test("누락되거나 손상된 메타데이터를 이미지 크기로 추측하지 않는다", () => {
  expect(readViewport(png)).toBeUndefined()
  expect(readViewport(Buffer.from("not a PNG"))).toBeUndefined()
  const damaged = annotate(png, { width: 414, height: 896 })
  damaged[60] ^= 1
  expect(readViewport(damaged)).toBeUndefined()
  expect(readViewport(annotate(png, { width: 414, height: 896 }).subarray(0, 60))).toBeUndefined()
  expect(annotate(png, { width: -1, height: 896 })).toEqual(png)
})
