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
  ])
})
test("corrupt records are rejected before any replacements", async () => {
  const { root, id, source, files } = await fixture()
  await writeFile(join(root, "unit-runs", `${randomUUID()}.json`), "{}")
  await expect(migrateRuntime(files)).rejects.toThrow()
  expect(await readFile(join(root, "unit-runs", `${id}.json`), "utf8")).toBe(source)
  expect(await files.history()).toEqual([])
})
