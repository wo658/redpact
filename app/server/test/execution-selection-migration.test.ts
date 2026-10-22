import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createRuntimeMigrationFiles } from "../src/adapters/storage/migrations.js"
import { migrateRuntime } from "../src/workflows/runtime-migrations.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "selection-migration-"))
  roots.push(root)
  const id = randomUUID()
  const source = JSON.stringify({
    version: 2,
    id,
    worktreeId: "wt",
    projectId: "project",
    projectRoot: "/project",
    settings: {
      dockerfile: "Dockerfile",
      cwd: ".",
      command: "pnpm test",
      patterns: ["test/*.test.ts"],
    },
    runtimeId: null,
    containerId: null,
    imageId: null,
    inputDigest: null,
    cleanup: { state: "removed", error: null },
    createdAt: "2026-10-01",
    finishedAt: "2026-10-01",
    state: "finished",
    outcome: "command_succeeded",
    exitCode: 0,
    stdout: "old evidence",
    stderr: "",
    truncated: false,
    error: null,
  })
  await mkdir(join(root, "unit-runs"))
  await writeFile(join(root, "unit-runs", `${id}.json`), source)
  return { root, id, source, files: createRuntimeMigrationFiles(root) }
}
test("migrates historical scope to unknown and preserves original bytes and verdict", async () => {
  const { root, id, source, files } = await fixture()
  await migrateRuntime(files)
  const record = JSON.parse(await readFile(join(root, "unit-runs", `${id}.json`), "utf8"))
  expect(record.executionSelection).toBeNull()
  expect(record.outcome).toBe("command_succeeded")
  expect(record.stdout).toBe("old evidence")
  expect(
    await readFile(
      join(root, ".migrations/backups/001-fixed-environment-settings/unit-runs", `${id}.json`),
      "utf8",
    ),
  ).toBe(source)
  expect(await files.history()).toContain("003-execution-selection")
})
test("an interrupted replacement retains original backup and retries without changing history", async () => {
  const { root, id, source, files } = await fixture()
  await expect(
    migrateRuntime({
      ...files,
      replaceExecutionSelection: async () => {
        throw new Error("interrupted")
      },
    }),
  ).rejects.toThrow("interrupted")
  expect(await files.history()).toEqual([])
  expect(await readFile(join(root, "unit-runs", `${id}.json`), "utf8")).toBe(source)
  await migrateRuntime(files)
  expect(
    JSON.parse(await readFile(join(root, "unit-runs", `${id}.json`), "utf8")).executionSelection,
  ).toBeNull()
  await migrateRuntime(files)
  expect(await files.history()).toEqual([
    "001-fixed-environment-settings",
    "002-flat-environment-values",
    "003-execution-selection",
    "004-manual-environment-scope",
  ])
})
test("corrupt records are rejected before any replacements", async () => {
  const { root, id, source, files } = await fixture()
  await writeFile(join(root, "unit-runs", `${randomUUID()}.json`), "{}")
  await expect(migrateRuntime(files)).rejects.toThrow()
  expect(await readFile(join(root, "unit-runs", `${id}.json`), "utf8")).toBe(source)
  expect(await files.history()).toEqual([])
})

test("잘못된 실행 이력의 파일 경로를 표시하고 원본과 완료 이력을 유지한다", async () => {
  const { root, id, files } = await fixture()
  const path = join(root, "unit-runs", `${id}.json`)
  const invalid = JSON.stringify({ version: 1, id })
  await writeFile(path, invalid)
  await expect(migrateRuntime(files)).rejects.toThrow(`unit-runs/${id}.json`)
  expect(await readFile(path, "utf8")).toBe(invalid)
  expect(await files.history()).toEqual([])
})

test("이미 선택 정보가 있는 백업도 재시도 중 변경된 현재 기록을 덮어쓰지 않는다", async () => {
  const { root, id, source, files } = await fixture()
  const original = JSON.stringify({ ...JSON.parse(source), executionSelection: null })
  const changed = JSON.stringify({ ...JSON.parse(original), stdout: "new evidence" })
  const path = join(root, "unit-runs", `${id}.json`)
  const backup = join(root, ".migrations/backups/001-fixed-environment-settings/unit-runs")
  await mkdir(backup, { recursive: true })
  await writeFile(join(backup, `${id}.json`), original)
  await writeFile(path, changed)
  await expect(migrateRuntime(files)).rejects.toThrow(`unit-runs/${id}`)
  expect(await readFile(path, "utf8")).toBe(changed)
  expect(await readFile(join(backup, `${id}.json`), "utf8")).toBe(original)
  expect(await files.history()).toEqual([])
})

test("이미 적용된 실행 선택 마이그레이션은 후속 단계에서 다시 실행하지 않는다", async () => {
  const { root, id, source, files } = await fixture()
  await files.recordHistory([
    "001-fixed-environment-settings",
    "002-flat-environment-values",
    "003-execution-selection",
  ])
  await migrateRuntime(files)
  expect(await readFile(join(root, "unit-runs", `${id}.json`), "utf8")).toBe(source)
  expect(await files.history()).toContain("004-manual-environment-scope")
})
