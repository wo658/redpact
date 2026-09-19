import { randomUUID } from "node:crypto"
import { expect, test, vi } from "vitest"
import type { ReviewRecord, ReviewStore } from "../src/core/types/reviews.js"
import { createReviewTests } from "../src/workflows/review-tests.js"

function fixture(policy: "auto" | "ask" = "auto") {
  const records = new Map<string, ReviewRecord>()
  const store: ReviewStore = {
    list: () => structuredClone([...records.values()]),
    save: (record) => {
      records.set(record.id, structuredClone(record))
    },
    policy: () => policy,
    setPolicy: (value) => {
      policy = value
    },
  }
  let digest = "settings-1"
  const submission = {
    id: randomUUID(),
    workItemId: randomUUID(),
    digest: "sources-1",
    files: [],
    parsed: [],
    createdAt: "now",
    runnerVersion: "test",
  }
  const settings = { valid: true, digest, settings: { dependencies: {}, tests: {} } }
  const start = vi.fn(async () => ({
    id: randomUUID(),
    state: "queued",
    submissionId: submission.id,
  }))
  const deps = {
    store,
    collect: async () => ({
      submission,
      settings: { ...settings, digest },
      selection: { services: ["app"], select: {} },
    }),
    settings: () => ({ read: async () => ({ ...settings, digest }) }),
    submissions: { get: () => submission },
    execute: { start, cancel: vi.fn() },
    runs: { get: (id: string) => ({ id, state: "queued", submissionId: submission.id }) },
  }
  return {
    deps: deps as unknown as Parameters<typeof createReviewTests>[0],
    records,
    start,
    store,
    setDigest: (value: string) => {
      digest = value
    },
  }
}

test("Ask captures a pending request without preparing or executing", async () => {
  const f = fixture("ask")
  const reviews = createReviewTests(f.deps)
  const value = await reviews.start({
    path: "/project",
    selection: { services: ["app"], select: {} },
  })
  expect(value?.review.state).toBe("pending")
  expect(f.start).not.toHaveBeenCalled()
})

test("Auto runs immediately and records automatic rather than human approval", async () => {
  const f = fixture()
  const reviews = createReviewTests(f.deps)
  const value = await reviews.start({ path: "/project" })
  expect(f.start).toHaveBeenCalledTimes(1)
  expect(value.review.policy).toBe("auto")
  expect(value.review.environmentApproved).toBe(false)
})

test("both approval gates are required, capabilities stay private, and retries do not run twice", async () => {
  const f = fixture("ask")
  const reviews = createReviewTests(f.deps)
  let value = await reviews.start({ path: "/project" })
  const id = value.review.id
  expect(value.review).not.toHaveProperty("token")
  const token = reviews.capability(id)
  await expect(
    reviews.approve({ id, token: "wrong", revision: 0, subject: "environment" }),
  ).rejects.toThrow()
  await expect(reviews.approve({ id, token, revision: 0, subject: "tests" })).rejects.toThrow()
  value = await reviews.approve({ id, token, revision: 0, subject: "environment" })
  expect(f.start).not.toHaveBeenCalled()
  const input = { id, token, revision: value.review.revision, subject: "tests" as const }
  await Promise.all([reviews.approve(input), reviews.approve(input)])
  expect(f.start).toHaveBeenCalledTimes(1)
})

test("policy changes in either direction apply only to newly captured requests", async () => {
  const f = fixture("ask")
  const reviews = createReviewTests(f.deps)
  const current = await reviews.start({ path: "/project" })
  reviews.changePolicy(reviews.capability(current.review.id), "auto")
  expect(reviews.get(current.review.id)?.review.policy).toBe("ask")
  const next = await reviews.start({ path: "/project" })
  expect(next.review.policy).toBe("auto")
  reviews.changePolicy(reviews.capability(next.review.id), "ask")
  expect((await reviews.start({ path: "/project" })).review.policy).toBe("ask")
})

test("settings changed during review cannot execute and restart never replays an uncertain start", async () => {
  const f = fixture("ask")
  const reviews = createReviewTests(f.deps)
  const value = await reviews.start({ path: "/project" })
  f.setDigest("changed")
  await expect(
    reviews.approve({
      id: value.review.id,
      token: reviews.capability(value.review.id),
      revision: 0,
      subject: "environment",
    }),
  ).rejects.toThrow(/changed/)
  expect(f.start).not.toHaveBeenCalled()
  const record = f.records.get(value.review.id)!
  f.store.save({ ...record, state: "starting" })
  const recovered = createReviewTests(f.deps)
  expect(recovered.get(record.id)?.review.state).toBe("interrupted")
})

test("Auto awaits shared project settings resolution before run admission", async () => {
  const f = fixture()
  const resolveSettings = f.deps.settings
  f.deps.settings = async (path) => resolveSettings(path)
  const reviews = createReviewTests(f.deps)
  await expect(reviews.start({ path: "/project" })).resolves.toMatchObject({
    review: { state: "started" },
  })
  expect(f.start).toHaveBeenCalledTimes(1)
})
