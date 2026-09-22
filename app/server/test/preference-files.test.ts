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
  const previous = { mainBranch: null, hideMerged: false }
  for (const source of [
    '{"services":["app"],"select":{},"select":{}}',
    '{"services":["app"],"select":{},"unknown":true}',
    " ".repeat(262145),
  ]) {
    await writeFile(join(path, ".redpact/tracking.json"), source)
    await expect(preferenceFiles.tracking(path, previous)).rejects.toThrow("tracking.json")
    expect(await readFile(join(path, ".redpact/tracking.json"), "utf8")).toBe(source)
  }
})
test("preference writes and recovery reject symlinks without changing their targets", async () => {
  const path = await root()
  const outside = await root()
  const value = { mainBranch: null, hideMerged: false }
  const file = join(outside, ".redpact/tracking.json")
  await writeFile(file, JSON.stringify(value))
  await symlink(file, join(path, ".redpact/tracking.json"))
  await expect(preferenceFiles.saveTracking(path, value)).rejects.toThrow()
  await rm(join(path, ".redpact"), { recursive: true })
  await symlink(join(outside, ".redpact"), join(path, ".redpact"))
  await expect(
    preferenceFiles.tracking(path, { mainBranch: null, hideMerged: false }),
  ).rejects.toThrow()
  expect(await readFile(file, "utf8")).toBe(JSON.stringify(value))
})
