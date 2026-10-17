import { randomUUID } from "node:crypto"
import { expect, test, vi } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"
import { readRunArtifact } from "../src/workflows/verification.js"

function fixture(kind = "playwright", admitted = true) {
  const reviewId = randomUUID()
  const runId = randomUUID()
  const artifactId = randomUUID()
  const artifact = { id: artifactId, contentType: "image/png", bytes: 3 }
  const get = vi.fn((id: string) => {
    if (id !== runId) {
      throw Object.assign(new Error("Run not found"), { code: "not_found" })
    }
    return { id: runId, before: { cases: [] }, after: { cases: [{ artifacts: [artifact] }] } }
  })
  const read = vi.fn(async () => ({ contentType: "image/png", data: new Uint8Array([1, 2, 3]) }))
  const services = {
    executionReviews: {
      get: (id: string) =>
        id === reviewId
          ? { review: { kind }, ...(admitted ? { run: { id: runId } } : {}) }
          : undefined,
    },
    captures: { get, artifact: read },
  } as unknown as Services
  return { reviewId, runId, artifactId, services, get, read }
}

test("승인 요청 ID로 아티팩트를 다운로드하면 승인된 실행 ID를 사용한다", async () => {
  const { reviewId, runId, artifactId, services, get, read } = fixture()
  const app = createApp(services)
  const response = await app.request(
    `/api/agent/runs/playwright/${reviewId}/artifacts/${artifactId}`,
  )
  expect(response.status).toBe(200)
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
  expect(get).toHaveBeenCalledWith(runId)
  expect(read).toHaveBeenCalledWith(runId, "after", artifactId)
})

test("대기 중인 요청과 다른 종류의 요청으로는 아티팩트를 읽지 않는다", async () => {
  for (const [kind, admitted, code] of [
    ["playwright", false, "invalid_input"],
    ["unit", true, "not_found"],
  ] as const) {
    const { reviewId, artifactId, services, get, read } = fixture(kind, admitted)
    await expect(
      readRunArtifact(services, { kind: "playwright", id: reviewId, artifactId, side: "after" }),
    ).rejects.toMatchObject({ code })
    expect(get).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  }
})

test("실행 ID 직접 조회는 유지하며 요청 ID를 써도 다른 실행이나 반대쪽 아티팩트는 거부한다", async () => {
  const { reviewId, runId, artifactId, services, read } = fixture()
  expect(
    await readRunArtifact(services, { kind: "playwright", id: runId, artifactId, side: "after" }),
  ).toMatchObject({ id: runId })
  read.mockClear()
  for (const input of [
    { artifactId: randomUUID(), side: "after" as const },
    { artifactId, side: "before" as const },
  ]) {
    await expect(
      readRunArtifact(services, { kind: "playwright", id: reviewId, ...input }),
    ).rejects.toMatchObject({ code: "not_found" })
  }
  expect(read).not.toHaveBeenCalled()
})
