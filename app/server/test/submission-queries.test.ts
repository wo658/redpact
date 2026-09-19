import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { openStore } from "../src/adapters/storage/files.js"
import { createSubmissions } from "../src/workflows/submissions.js"
import { storageTarget } from "./helpers/storage.js"

const cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) {
    close()
  }
})
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "redpact-submission-queries-"))
  let storage = openStore(directory)
  cleanup.push(() => {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const target = storageTarget(storage.store, directory)
  storage.store.saveWorktree({
    id: "other",
    projectId: target.projectId,
    projectRoot: directory,
    checkoutRoot: directory,
    gitdir: null,
    createdAt: "now",
  })
  for (const worktreeId of [target.worktreeId, "other"]) {
    storage.store.createWorkItem({
      id: `work-${worktreeId}`,
      projectId: target.projectId,
      worktreeId,
      intent: "Indexed history",
      createdAt: "now",
    })
  }
  function add(id: string, worktreeId = target.worktreeId, createdAt = "2026-09-09") {
    storage.store.createSubmission({
      id,
      workItemId: `work-${worktreeId}`,
      worktreeId,
      projectId: target.projectId,
      createdAt,
      digest: id,
      runnerVersion: "test",
      parsed: [],
      files: [{ path: "large.test.ts", source: "private source".repeat(100) }],
    })
  }
  function service() {
    return createSubmissions({
      store: storage.store,
      parse: () => ({ scenarios: [], limitations: [] }),
      runnerVersion: "test",
    })
  }
  return {
    directory,
    add,
    service,
    target,
    get store() {
      return storage.store
    },
    reopen() {
      storage.close()
      storage = openStore(directory)
    },
  }
}

test("repeated submission pages read bounded payloads instead of all history", () => {
  const f = fixture()
  for (let i = 0; i < 60; i++) {
    f.add(`s${String(i).padStart(3, "0")}`, i % 2 ? "other" : f.target.worktreeId)
  }
  const service = f.service()
  const first = service.list(f.target.worktreeId)
  const read = vi.spyOn(f.store, "getSubmission")
  const next = service.list(f.target.worktreeId, first.nextCursor ?? undefined)
  expect(next.items).toHaveLength(10)
  expect(read.mock.calls.length).toBeLessThanOrEqual(21)
  expect(read.mock.calls.every(([id]) => Number(id.slice(1)) % 2 === 0)).toBe(true)
  expect(JSON.stringify(next)).not.toContain("private source")
})

test("submission pagination survives restart and insertion before an existing cursor", () => {
  const f = fixture()
  for (let i = 0; i < 23; i++) {
    f.add(`s${String(i).padStart(3, "0")}`)
  }
  const first = f.service().list(f.target.worktreeId)
  expect(first.items[0].id).toBe("s022")
  f.add("newer", f.target.worktreeId, "2026-09-10")
  expect(f.service().list(f.target.worktreeId).items[0].id).toBe("newer")
  expect(
    f
      .service()
      .list(f.target.worktreeId, first.nextCursor ?? undefined)
      .items.map((s) => s.id),
  ).toEqual(["s002", "s001", "s000"])
  f.reopen()
  expect(f.service().list(f.target.worktreeId).items[0].id).toBe("newer")
  expect(
    f
      .service()
      .list(f.target.worktreeId, first.nextCursor ?? undefined)
      .items.map((s) => s.id),
  ).toEqual(["s002", "s001", "s000"])
  f.add("foreign", "other")
  expect(() => f.service().list(f.target.worktreeId, "foreign")).toThrow(
    "Invalid submission cursor",
  )
  expect(() => f.service().list(f.target.worktreeId, "missing")).toThrow(
    "Invalid submission cursor",
  )
})

test("queried corrupted submission records still fail after warming queries", () => {
  const f = fixture()
  f.add("source")
  f.service().list(f.target.worktreeId)
  writeFileSync(join(f.directory, "submissions/source.json"), "broken")
  expect(() => f.service().list(f.target.worktreeId)).toThrow("Invalid persisted record")
  f.reopen()
  expect(() => f.service().list(f.target.worktreeId)).toThrow("Invalid persisted record")
})

test("latest reads only its selected record, observes own writes and rebuilds after restart", () => {
  const f = fixture()
  expect(f.service().latest(f.target.worktreeId)).toBeUndefined()
  for (let i = 0; i < 25; i++) {
    f.add(`s${String(i).padStart(3, "0")}`)
    f.add(`foreign${i}`, "other")
  }
  const read = vi.spyOn(f.store, "getSubmission")
  expect(f.service().latest(f.target.worktreeId)?.id).toBe("s024")
  expect(read.mock.calls).toEqual([["s024"]])
  f.add("newer", f.target.worktreeId, "2026-09-10")
  expect(f.service().latest(f.target.worktreeId)?.id).toBe("newer")
  expect(() => f.add("newer", f.target.worktreeId, "2026-09-11")).toThrow()
  expect(f.service().latest(f.target.worktreeId)?.createdAt).toBe("2026-09-10")
  f.reopen()
  expect(f.service().latest(f.target.worktreeId)?.id).toBe("newer")
  const reopenedRead = vi.spyOn(f.store, "getSubmission")
  expect(f.service().latest(f.target.worktreeId)?.id).toBe("newer")
  expect(reopenedRead.mock.calls).toEqual([["newer"]])
  expect(() => f.service().latest("missing")).toThrow("Worktree not found")
})
