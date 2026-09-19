import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createRunLogReader } from "../src/adapters/storage/run-logs.js"

test("run log reader preserves output, distinguishes missing and empty, and bounds large files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpact-log-"))
  try {
    const path = join(directory, "runs", "r1")
    await mkdir(path, { recursive: true })
    const read = createRunLogReader(directory)
    await writeFile(join(path, "stdout.log"), "actual output\n")
    expect(await read("r1")).toEqual({
      stdout: { text: "actual output\n", truncated: false },
      stderr: null,
    })
    await writeFile(join(path, "stderr.log"), "")
    expect((await read("r1")).stderr).toEqual({ text: "", truncated: false })
    await writeFile(join(path, "stdout.log"), "x".repeat(300_000))
    expect((await read("r1")).stdout).toEqual({ text: "x".repeat(256 * 1024), truncated: true })
    await expect(read("../outside")).rejects.toThrow()
    await rm(join(path, "stdout.log"))
    await symlink(join(path, "stderr.log"), join(path, "stdout.log"))
    await expect(read("r1")).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
