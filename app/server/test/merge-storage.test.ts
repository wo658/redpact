import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createMergeStore } from "../src/adapters/storage/merges.js"
import type { MergeRecord } from "../src/core/types/merge.js"
import { createMergeService } from "../src/workflows/merge.js"

test("중단된 머지는 재실행하지 않고 기록을 보존하며 손상된 형식을 거절한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-merge-storage-"))
  try {
    const record: MergeRecord = {
      version: 1,
      id: randomUUID(),
      worktreeId: "w",
      projectId: "p",
      sourceRoot: "/source",
      sourceBranch: "feature",
      sourceHead: "source-head",
      targetRoot: "/target",
      targetBranch: "main",
      targetHead: "target-head",
      candidatePath: "/candidate",
      mergedHead: null,
      state: "running",
      createdAt: "now",
      finishedAt: null,
      conflicts: [],
      output: "",
      error: null,
      cleanupError: null,
      resolutionRequest: "",
    }
    createMergeStore(directory).save(record)
    let mutations = 0
    createMergeService({
      directory,
      store: createMergeStore(directory),
      worktrees: {} as never,
      projects: {} as never,
      git: {
        candidate: async () => {
          mutations++
          throw new Error("Unexpected replay")
        },
      } as never,
    })
    const recovered = createMergeStore(directory).list()
    expect(recovered).toHaveLength(1)
    expect(recovered[0]).toMatchObject({
      id: record.id,
      state: "interrupted",
      candidatePath: "/candidate",
    })
    expect(mutations).toBe(0)
    expect(recovered[0].cleanupError).toContain("not confirmed")
    expect(recovered[0].resolutionRequest).toContain("Inspect")
    const file = join(directory, "merges", `${record.id}.json`)
    const stored = JSON.parse(await readFile(file, "utf8"))
    await writeFile(file, JSON.stringify({ ...stored, version: 0 }))
    expect(() => createMergeStore(directory).list()).toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
