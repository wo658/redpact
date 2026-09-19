import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { snapshotInputs } from "../src/adapters/environment/inputs.js"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "environment-inputs-"))
  roots.push(root)
  return root
}

test("source capture copies more than 100 MiB and preserves its digest", async () => {
  const root = await directory()
  const destination = await directory()
  const contents = Buffer.alloc(100 * 1024 * 1024 + 1, 97)
  await writeFile(join(root, "large.bin"), contents, { mode: 0o600 })
  const expected = createHash("sha256")
    .update(JSON.stringify(["large.bin", 0o600, contents.length]))
    .update(contents)
    .digest("hex")
  await expect(snapshotInputs(root, destination)).resolves.toBe(expected)
  expect((await readFile(join(destination, "large.bin"))).equals(contents)).toBe(true)
  await expect(snapshotInputs(root)).resolves.toBe(expected)
}, 30000)

test("source capture copies more than 10000 files and fingerprints every file", async () => {
  const root = await directory()
  const destination = await directory()
  for (let start = 0; start < 10001; start += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, 10001 - start) }, (_, offset) =>
        writeFile(join(root, `${start + offset}.txt`), "source"),
      ),
    )
  }
  await expect(snapshotInputs(root, destination)).resolves.toMatch(/^[a-f0-9]{64}$/)
  expect(await readdir(destination)).toHaveLength(10001)
  const digest = await snapshotInputs(destination)
  await expect(snapshotInputs(root)).resolves.toBe(digest)
  await writeFile(join(root, "9999.txt"), "changed")
  await expect(snapshotInputs(root)).resolves.not.toBe(digest)
}, 30000)

test("호스트 pnpm 캐시 링크를 제외하고 소스와 digest를 보존한다", async () => {
  const root = await directory()
  const destination = await directory()
  await writeFile(join(root, "test.ts"), "source")
  const digest = await snapshotInputs(root)
  await symlink("/missing-host-pnpm-store", join(root, ".pnpm-store"))
  await expect(snapshotInputs(root, destination)).resolves.toBe(digest)
  expect(await readdir(destination)).toEqual(["test.ts"])
})
