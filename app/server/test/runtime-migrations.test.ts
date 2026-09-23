import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createRuntimeMigrationFiles } from "../src/adapters/storage/migrations.js"
import { validateMigrationHistory } from "../src/core/runtime-migrations.js"
import { migrateRuntime } from "../src/workflows/runtime-migrations.js"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "redpact-migrations-"))
  directories.push(root)
  return { root, files: createRuntimeMigrationFiles(root) }
}

test.each([null, {}, ["future"], ["001", "001"], ["002"], ["001", "future"]])(
  "rejects unknown, duplicate and out-of-order history: %j",
  (history) => {
    expect(() => validateMigrationHistory(history, ["001", "002"])).toThrow(
      "Unsupported runtime migration history",
    )
  },
)

test("does not treat malformed migration history as an empty installation", async () => {
  const { root, files } = await fixture()
  const path = join(root, ".migrations", "completed.json")
  await mkdir(join(root, ".migrations"))
  await writeFile(path, "{")
  await expect(migrateRuntime(files)).rejects.toThrow()
  expect(await readFile(path, "utf8")).toBe("{")
})

test("a journal write failure is retryable and never marks a failed step complete", async () => {
  const { root, files } = await fixture()
  await expect(
    migrateRuntime({
      ...files,
      recordHistory: async () => {
        throw new Error("Disk full")
      },
    }),
  ).rejects.toThrow("Disk full")
  await expect(readFile(join(root, ".migrations", "completed.json"))).rejects.toMatchObject({
    code: "ENOENT",
  })
  await migrateRuntime(files)
  expect(await files.history()).toEqual(["001-fixed-environment-settings"])
})

test("validates every record before writes and includes the failing record path", async () => {
  const { root, files } = await fixture()
  await mkdir(join(root, "environments"))
  const id = randomUUID()
  const path = join(root, "environments", `${id}.json`)
  await writeFile(path, "{")
  await expect(migrateRuntime(files)).rejects.toThrow(`environments/${id}.json`)
  expect(await readFile(path, "utf8")).toBe("{")
  expect(await files.history()).toEqual([])
})

test("backs up exact bytes without replacing an earlier original and checks concurrent edits", async () => {
  const { root, files } = await fixture()
  const id = randomUUID()
  const file = { id, source: '{"original":true}\n' }
  await mkdir(join(root, "environments"))
  const path = join(root, "environments", `${id}.json`)
  await writeFile(path, file.source)
  await files.backupEnvironment("001", file)
  await expect(
    files.backupEnvironment("001", { ...file, source: "changed" }),
  ).rejects.toMatchObject({ code: "EEXIST" })
  expect(
    await readFile(
      join(root, ".migrations", "backups", "001", "environments", `${id}.json`),
      "utf8",
    ),
  ).toBe(file.source)
  await writeFile(path, "external edit")
  await expect(files.replaceEnvironment(file, "migration output")).rejects.toThrow(
    "changed during migration",
  )
  expect(await readFile(path, "utf8")).toBe("external edit")
})
