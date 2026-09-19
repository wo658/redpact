import { spawnSync } from "node:child_process"
import { cp, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

test("the built runner initializes outside the repository without its workspace lockfile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-relocated-"))
  const root = fileURLToPath(new URL("../", import.meta.url))
  try {
    await cp(join(root, "dist"), join(directory, "dist"), { recursive: true })
    await cp(join(root, "package.json"), join(directory, "package.json"))
    await symlink(join(root, "node_modules"), join(directory, "node_modules"), "junction")
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      try {
        const { createVitestRunner } = await import('./dist/adapters/test-runner/vitest.js');
        const runner = createVitestRunner('./state');
        console.log(JSON.stringify({ ready: true, version: runner.version }));
      } catch (error) {
        console.log(JSON.stringify({ ready: false, error: error.message }));
      }
    `,
      ],
      { cwd: directory, encoding: "utf8" },
    )
    expect(JSON.parse(result.stdout)).toMatchObject({
      ready: true,
      version: expect.stringContaining("vitest@"),
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
