import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createComposeAdapter } from "../src/adapters/environment/testcontainers.js"
import type { Environment } from "../src/core/types/environment.js"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("preparation failure before Docker removes captured data and preserves logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-cleanup-"))
  roots.push(root)
  const record = { id: randomUUID() } as Environment
  const directory = join(root, "environments", record.id)
  await mkdir(join(directory, "source", "node_modules"), { recursive: true })
  await writeFile(join(directory, "source", "private-env"), "runtime values")
  await writeFile(join(directory, "preparation.log"), "Preparation failed")
  await createComposeAdapter(root).stop(record)
  await expect(access(join(directory, "source"))).rejects.toThrow()
  expect(await readFile(join(directory, "preparation.log"), "utf8")).toBe("Preparation failed")
})
