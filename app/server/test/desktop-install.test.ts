import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"

const { installBundle } = await import(
  new URL("../../desktop/tools/local-update.ts", import.meta.url).href
)

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "redpact-desktop-install-"))
  roots.push(root)
  const destination = join(root, "Redpact.app")
  const staged = join(root, "staged.app")
  const backup = join(root, "previous.app")
  await mkdir(destination)
  await mkdir(staged)
  await writeFile(join(destination, "version"), "old")
  await writeFile(join(staged, "version"), "new")
  return { destination, staged, backup }
}
test("stops before replacement and retains the previous app", async () => {
  const paths = await fixture()
  let stopped = false
  await installBundle({
    ...paths,
    stop: async () => {
      expect(await readFile(join(paths.destination, "version"), "utf8")).toBe("old")
      stopped = true
    },
  })
  expect(stopped).toBe(true)
  expect(await readFile(join(paths.destination, "version"), "utf8")).toBe("new")
  expect(await readFile(join(paths.backup, "version"), "utf8")).toBe("old")
})
test("failed shutdown leaves the installed app intact", async () => {
  const paths = await fixture()
  await expect(
    installBundle({
      ...paths,
      stop: async () => {
        throw new Error("cleanup pending")
      },
    }),
  ).rejects.toThrow("cleanup pending")
  expect(await readFile(join(paths.destination, "version"), "utf8")).toBe("old")
})
test("failed replacement restores the previous bundle", async () => {
  const paths = await fixture()
  await rm(paths.staged, { recursive: true })
  await expect(installBundle({ ...paths, stop: async () => {} })).rejects.toThrow()
  expect(await readFile(join(paths.destination, "version"), "utf8")).toBe("old")
})
