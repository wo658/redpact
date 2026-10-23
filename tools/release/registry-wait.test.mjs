import assert from "node:assert/strict"
import { test } from "node:test"
import { waitForPublishedMetadata } from "./registry-wait.mjs"

test("검사 대기 중 404는 재업로드 없이 기다리고 공개된 메타데이터를 반환한다", async () => {
  let time = 0
  let requests = 0
  const result = await waitForPublishedMetadata("https://registry.example/package/1.0.0", {
    fetchMetadata: async () => {
      requests++
      return requests < 4
        ? new Response(null, { status: 404 })
        : Response.json({ dist: { integrity: "sha512-verified" } })
    },
    now: () => time,
    pause: async (ms) => {
      time += ms
    },
    timeoutMs: 30000,
    intervalMs: 10000,
  })
  assert.equal(result.dist.integrity, "sha512-verified")
  assert.equal(requests, 4)
  assert.equal(time, 30000)
})

test("공개 대기가 끝나도 404이면 게시 성공으로 처리하지 않는다", async () => {
  let time = 0
  await assert.rejects(
    waitForPublishedMetadata("https://registry.example/package/1.0.0", {
      fetchMetadata: async () => new Response(null, { status: 404 }),
      now: () => time,
      pause: async (ms) => {
        time += ms
      },
      timeoutMs: 25000,
      intervalMs: 10000,
    }),
    /not visible.*25000/,
  )
  assert.equal(time, 25000)
})

test("인증·서버 오류는 검사 지연으로 숨기지 않고 즉시 실패한다", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      waitForPublishedMetadata("https://registry.example/package/1.0.0", {
        fetchMetadata: async () => new Response(null, { status }),
        pause: async () => assert.fail("must not wait after a non-404 error"),
      }),
      new RegExp(`HTTP ${status}`),
    )
  }
})

test("기본 공개 대기는 긴 npm 검사도 30분까지 기다린다", async () => {
  let time = 0
  const metadata = await waitForPublishedMetadata("https://registry.example/package/1.0.0", {
    fetchMetadata: async () =>
      time < 20 * 60 * 1000
        ? new Response(null, { status: 404 })
        : Response.json({ version: "1.0.0" }),
    now: () => time,
    pause: async (ms) => {
      time += ms
    },
  }).catch(() => null)
  assert.deepEqual(metadata, { version: "1.0.0" })
  assert.equal(time, 20 * 60 * 1000)
})
