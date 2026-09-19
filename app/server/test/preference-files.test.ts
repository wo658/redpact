import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { preferenceFiles } from "../src/adapters/settings/preferences.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function root() {
  const path = await mkdtemp(join(tmpdir(), "redpact-preferences-"))
  roots.push(path)
  await mkdir(join(path, ".redpact"))
  return path
}
test("preference files reject duplicate keys, unknown fields and oversized input without legacy fallback", async () => {
  const path = await root()
  const previous = { services: ["app"], select: {} }
  for (const source of [
    '{"services":["app"],"select":{},"select":{}}',
    '{"services":["app"],"select":{},"unknown":true}',
    " ".repeat(262145),
  ]) {
    await writeFile(join(path, ".redpact/selection.json"), source)
    await expect(preferenceFiles.selection(path, previous)).rejects.toThrow("selection.json")
    expect(await readFile(join(path, ".redpact/selection.json"), "utf8")).toBe(source)
  }
})
test("preference writes and recovery reject symlinks without changing their targets", async () => {
  const path = await root()
  const outside = await root()
  const value = { services: ["app"], select: {} }
  const file = join(outside, ".redpact/selection.json")
  await writeFile(file, JSON.stringify(value))
  await symlink(file, join(path, ".redpact/selection.json"))
  await expect(preferenceFiles.saveSelection(path, value)).rejects.toThrow()
  await rm(join(path, ".redpact"), { recursive: true })
  await symlink(join(outside, ".redpact"), join(path, ".redpact"))
  await expect(
    preferenceFiles.tracking(path, { mainBranch: null, hideMerged: false }),
  ).rejects.toThrow()
  expect(await readFile(file, "utf8")).toBe(JSON.stringify(value))
})

test("integration defaults use strict independent files and never recover worktree selections", async () => {
  const path = await root()
  await preferenceFiles.saveSelection(path, { services: ["worktree"], select: {} })
  expect(await preferenceFiles.integrationDefaults(path)).toBeNull()
  const value = { services: ["app"], select: {} }
  await preferenceFiles.saveIntegrationDefaults(path, value)
  expect(await preferenceFiles.integrationDefaults(path)).toEqual(value)
  for (const source of [
    '{"services":["app"],"select":{},"select":{}}',
    '{"services":[],"select":{}}',
    '{"services":["app"],"select":{},"extra":1}',
  ]) {
    await writeFile(join(path, ".redpact/integration-defaults.json"), source)
    await expect(preferenceFiles.integrationDefaults(path)).rejects.toThrow(
      "integration-defaults.json",
    )
  }
  expect(await preferenceFiles.selection(path)).toEqual({ services: ["worktree"], select: {} })
})
