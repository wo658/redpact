import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createExecutionReviewStore } from "../src/adapters/storage/execution-reviews.js"
import { settingsSchema } from "../src/core/settings-schema.js"
import { createExecutionReviews } from "../src/workflows/execution-reviews.js"

function fixture(directory: string) {
  const settings = settingsSchema.parse({
    unitTests: { dockerfile: "Dockerfile", command: "pnpm test", patterns: ["unit/**/*.test.ts"] },
    playwright: {
      service: "app",
      port: 3000,
      targets: { functional: { purpose: "functional", testMatch: ["**/*.spec.ts"] } },
    },
  })
  const store = createExecutionReviewStore(directory)
  const deps = {
    store,
    worktrees: {
      connect: vi.fn(async () => ({ id: "project" })),
      ensure: vi.fn(async () => ({ id: "worktree", projectRoot: "/project" })),
      resolve: vi.fn(async () => ({
        worktree: { id: "worktree", projectRoot: "/project" },
        settings: { read: async () => ({ valid: true, digest: "settings", settings }) },
      })),
      getSelection: async () => ({ services: ["app"], select: {} }),
    },
    units: {
      preview: vi.fn(async () => ({
        settings: structuredClone(settings.unitTests!),
        inputDigest: "unit-input",
      })),
      start: vi.fn(async () => ({ id: "unit-run", state: "running" })),
      get: vi.fn((id) => ({ id, state: "running" })),
      cancel: vi.fn(async () => ({})),
    },
    playwright: {
      start: vi.fn(async () => ({ id: "playwright-run", state: "queued" })),
      cancel: vi.fn(async () => ({})),
    },
    captures: { get: vi.fn((id) => ({ id, state: "queued" })) },
    environments: { fingerprint: vi.fn(async () => "application") },
    sourceDigest: vi.fn(async () => "test-source"),
  }
  const create = () => createExecutionReviews(deps as never)
  return { deps, store, create, service: create() }
}
async function withFixture(
  action: (value: ReturnType<typeof fixture>, directory: string) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), "redpact-execution-review-"))
  try {
    await action(fixture(directory), directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("Unit과 Playwright 요청은 정확한 입력을 보존하고 승인 전 코드를 실행하지 않는다", async () =>
  withFixture(async ({ service, deps }) => {
    for (const kind of ["unit", "playwright"] as const) {
      const view = await service.request({
        kind,
        path: "/project",
        target: "functional",
        viewport: { width: 390, height: 844 },
      })
      expect(view.review).toMatchObject({
        kind,
        state: "pending",
        settingsDigest: "settings",
        revision: 0,
      })
      expect(view.review).not.toHaveProperty("token")
      expect(service.list()).toContainEqual(view)
      if (kind === "unit") {
        expect(view.review.specification).toMatchObject({
          command: "pnpm test",
          dockerfile: "Dockerfile",
        })
      } else {
        expect(view.review.specification).toMatchObject({
          target: "functional",
          purpose: "functional",
          viewport: { width: 390, height: 844 },
        })
        expect(view.review.sourceDigest).toBe("test-source")
      }
    }
    expect(deps.units.start).not.toHaveBeenCalled()
    expect(deps.playwright.start).not.toHaveBeenCalled()
  }))

test("잘못된 capability와 오래된 revision은 실행 권한을 주지 않는다", async () =>
  withFixture(async ({ service, deps }) => {
    const { review } = await service.request({ kind: "unit", path: "/project" })
    await expect(
      service.approve({ id: review.id, token: "forged", revision: 0 }),
    ).rejects.toMatchObject({ code: "invalid_input" })
    await expect(
      service.approve({ id: review.id, token: service.capability(review.id), revision: 1 }),
    ).rejects.toMatchObject({ code: "invalid_input" })
    expect(deps.units.start).not.toHaveBeenCalled()
  }))

test("동시 중복 승인은 하나의 실행만 시작하고 그 실행을 반환한다", async () =>
  withFixture(async ({ service, deps }) => {
    const { review } = await service.request({ kind: "unit", path: "/project" })
    const input = { id: review.id, token: service.capability(review.id), revision: 0 }
    const [first, second] = await Promise.all([service.approve(input), service.approve(input)])
    expect(first.run?.id).toBe("unit-run")
    expect(second.run?.id).toBe(first.run?.id)
    expect(deps.units.start).toHaveBeenCalledExactlyOnceWith("worktree", {
      settings: review.specification,
      inputDigest: "unit-input",
    })
    expect(service.get("unit-run")?.review.id).toBe(review.id)
  }))

test.each(["unit", "playwright"] as const)(
  "%s 입력이 바뀌면 승인을 거부하고 실행하지 않는다",
  async (kind) =>
    withFixture(async ({ service, deps }) => {
      const { review } = await service.request({ kind, path: "/project", target: "functional" })
      if (kind === "unit") {
        const original = await deps.units.preview()
        deps.units.preview.mockResolvedValue({ ...original, inputDigest: "changed" })
      } else {
        deps.sourceDigest.mockResolvedValue("changed")
      }
      await expect(
        service.approve({ id: review.id, token: service.capability(review.id), revision: 0 }),
      ).rejects.toMatchObject({ code: "configuration_error" })
      expect(deps.units.start).not.toHaveBeenCalled()
      expect(deps.playwright.start).not.toHaveBeenCalled()
    }),
)

test("Playwright 승인은 원래 viewport와 검토한 입력 식별자를 실행 경계에 전달한다", async () =>
  withFixture(async ({ service, deps }) => {
    const viewport = { width: 390, height: 844 }
    const { review } = await service.request({
      kind: "playwright",
      path: "/project",
      target: "functional",
      viewport,
    })
    await service.approve({ id: review.id, token: service.capability(review.id), revision: 0 })
    expect(deps.playwright.start).toHaveBeenCalledExactlyOnceWith(
      "worktree",
      undefined,
      viewport,
      "functional",
      { settingsDigest: "settings", inputDigest: "application", sourceDigest: "test-source" },
    )
  }))

test("재시작은 대기 검토를 보존하고 불확실한 admission을 재실행하지 않는다", async () =>
  withFixture(async ({ service, store, create, deps }) => {
    const pending = await service.request({ kind: "unit", path: "/project" })
    const starting = await service.request({
      kind: "playwright",
      path: "/project",
      target: "functional",
    })
    store.save({
      ...store.list().find((record) => record.id === starting.review.id)!,
      state: "starting",
    })
    const recovered = create()
    expect(recovered.get(pending.review.id)?.review.state).toBe("pending")
    expect(recovered.get(starting.review.id)?.review.state).toBe("interrupted")
    expect(recovered.capability(pending.review.id)).toBe(service.capability(pending.review.id))
    expect(deps.units.start).not.toHaveBeenCalled()
    expect(deps.playwright.start).not.toHaveBeenCalled()
  }))

test("취소한 검토는 승인할 수 없고 실행 기록을 만들지 않는다", async () =>
  withFixture(async ({ service, deps }) => {
    const { review } = await service.request({ kind: "unit", path: "/project" })
    await service.cancel(review.id)
    await expect(
      service.approve({ id: review.id, token: service.capability(review.id), revision: 0 }),
    ).rejects.toMatchObject({ code: "invalid_input" })
    expect(service.get(review.id)?.review.state).toBe("cancelled")
    expect(deps.units.start).not.toHaveBeenCalled()
  }))

test("잘못된 영속 검토는 읽기에서 실패하며 원본을 초기화하지 않는다", async () =>
  withFixture(async ({ service, store }, directory) => {
    const { review } = await service.request({ kind: "unit", path: "/project" })
    const path = join(directory, "execution-reviews", `${review.id}.json`)
    writeFileSync(path, '{"version":99}')
    expect(() => store.list()).toThrow()
    expect(readFileSync(path, "utf8")).toBe('{"version":99}')
  }))

test("실행 후 검토 기록 저장이 중단되면 불확실한 시작을 보존하고 재실행하지 않는다", async () =>
  withFixture(async ({ service, store, create, deps }) => {
    const { review } = await service.request({ kind: "unit", path: "/project" })
    const save = store.save
    store.save = (record) => {
      if (record.state === "started") {
        throw new Error("disk interruption")
      }
      save(record)
    }
    await expect(
      service.approve({ id: review.id, token: service.capability(review.id), revision: 0 }),
    ).rejects.toThrow("disk interruption")
    expect(store.list()[0].state).toBe("starting")
    const recovered = create()
    expect(recovered.get(review.id)?.review.state).toBe("interrupted")
    await expect(
      recovered.approve({ id: review.id, token: service.capability(review.id), revision: 1 }),
    ).rejects.toMatchObject({ code: "invalid_input" })
    expect(deps.units.start).toHaveBeenCalledOnce()
  }))

test("실행 상태와 연결 ID가 모순되는 영속 검토를 거부한다", async () =>
  withFixture(async ({ service, store }) => {
    await service.request({ kind: "unit", path: "/project" })
    const record = store.list()[0]
    expect(() => store.save({ ...record, state: "started" })).toThrow()
    expect(() => store.save({ ...record, state: "pending", runId: "unexpected-run" })).toThrow()
  }))
