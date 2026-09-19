import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { openStore } from "../src/adapters/storage/files.js"
import { storageTarget } from "./helpers/storage.js"

test("work items are durable inspectable JSON files", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-files-"))
  const path = join(directory, "state")
  const storage = openStore(path)
  const target = storageTarget(storage.store, directory)
  try {
    storage.store.createWorkItem({
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      id: "work",
      intent: "Inspect persisted intent",
      createdAt: new Date().toISOString(),
    })
    expect(existsSync(join(path, "work-items", "work.json"))).toBe(true)
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("one writer owns a state directory and records survive reopening", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-lock-"))
  const storage = openStore(directory)
  try {
    const target = storageTarget(storage.store, directory)
    expect(() => openStore(directory)).toThrow("locked")
    const work = {
      id: "work",
      intent: "Persist once",
      createdAt: "now",
      projectId: target.projectId,
      worktreeId: target.worktreeId,
    }
    storage.store.createWorkItem(work)
    expect(() => storage.store.createWorkItem({ ...work, intent: "Overwrite" })).toThrow()
    expect(storage.store.getWorkItem("../escape")).toBeUndefined()
    expect(storage.store.getWorkItem("work")).toEqual(work)
    storage.close()
    const reopened = openStore(directory)
    try {
      expect(reopened.store.getWorkItem("work")).toEqual(work)
    } finally {
      reopened.close()
    }
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("corrupted or future-version records are errors, never missing data", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-corrupt-"))
  const storage = openStore(directory)
  const target = storageTarget(storage.store, directory)
  try {
    storage.store.createWorkItem({
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      id: "work",
      intent: "Keep evidence",
      createdAt: "now",
    })
    writeFileSync(join(directory, "work-items/work.json"), '{"version":99,"data":{}}')
    expect(() => storage.store.getWorkItem("work")).toThrow("Invalid persisted record")
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("storage ignores obsolete database files instead of importing them", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-no-import-"))
  writeFileSync(join(directory, "redpact.sqlite"), "obsolete database")
  let storage: ReturnType<typeof openStore> | undefined
  try {
    expect(() => {
      storage = openStore(directory)
    }).not.toThrow()
    expect(storage?.store.listWorkItems()).toEqual([])
    expect(existsSync(join(directory, ".sqlite-imported"))).toBe(false)
  } finally {
    storage?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("only the current record envelope is accepted", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-format-"))
  const storage = openStore(directory)
  try {
    const target = storageTarget(storage.store, directory)
    const work = {
      id: "work",
      intent: "Current format",
      createdAt: "now",
      projectId: target.projectId,
      worktreeId: target.worktreeId,
    }
    storage.store.createWorkItem(work)
    writeFileSync(
      join(directory, "work-items/work.json"),
      JSON.stringify({ version: 2, data: work }),
    )
    expect(() => storage.store.getWorkItem("work")).toThrow("Invalid persisted record")
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("observation discovery includes finished runs stored in execution directories", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-observations-"))
  const storage = openStore(directory)
  const target = storageTarget(storage.store, directory)
  try {
    storage.store.createWorkItem({
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      id: "work",
      intent: "Observe",
      createdAt: "now",
    })
    const submission = {
      id: "submission",
      workItemId: "work",
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      files: [],
      digest: "digest",
      runnerVersion: "test",
      parsed: [],
      createdAt: "now",
    }
    storage.store.createSubmission(submission)
    storage.store.saveRun({
      target,
      id: "run",
      submissionId: submission.id,
      state: "finished",
      createdAt: "now",
      finishedAt: "now",
      limitations: [],
      result: { outcome: "passed", cases: [], errors: [] },
    })
    expect(storage.store.listSubmissions().map((item) => item.id)).toEqual(["submission"])
    expect(storage.store.listRuns().map((item) => item.id)).toEqual(["run"])
    storage.close()
    const reopened = openStore(directory)
    try {
      expect(reopened.store.listRuns().map((item) => item.id)).toEqual(["run"])
    } finally {
      reopened.close()
    }
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("obsolete submission input metadata is rejected", () => {
  const directory = mkdtempSync(join(tmpdir(), "redpact-input-history-"))
  const storage = openStore(directory)
  const target = storageTarget(storage.store, directory)
  try {
    storage.store.createWorkItem({
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      id: "work",
      intent: "Retained input revision",
      createdAt: "now",
    })
    storage.store.createSubmission({
      id: "submission",
      workItemId: "work",
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      files: [],
      digest: "digest",
      runnerVersion: "fixture",
      parsed: [],
      createdAt: "now",
    })
    const path = join(directory, "submissions/submission.json")
    const record = JSON.parse(readFileSync(path, "utf8"))
    record.data.inputs = { "tests/api.test.js": ["inputs/request.json"] }
    record.data.parentSubmissionId = "previous"
    const original = JSON.stringify(record)
    writeFileSync(path, original)
    expect(() => storage.store.getSubmission("submission")).toThrow("Invalid persisted record")
    expect(readFileSync(path, "utf8")).toBe(original)
  } finally {
    storage.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
