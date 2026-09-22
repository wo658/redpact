import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { readJsonSettings } from "../src/adapters/settings/json.js"

test("empty dependency settings can be inspected without configuring execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "empty-dependencies-"))
  try {
    await mkdir(join(root, ".redpact"))
    await writeFile(
      join(root, ".redpact/settings.json"),
      JSON.stringify({ composeFiles: [], dependencies: {} }),
    )
    const inspection = await readJsonSettings(root)
    expect(inspection.valid).toBe(true)
    expect(inspection.issues).toEqual([])
    expect(inspection.settings?.dependencies).toEqual({})
    const execution = await readJsonSettings(root, { services: ["app"], select: {} })
    expect(execution.valid).toBe(true)
    expect(execution.issues).toEqual([])
    expect(execution.plan).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
