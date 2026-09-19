import { execFile } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, expect, test } from "vitest"

const exec = promisify(execFile)
const hook = fileURLToPath(new URL("../../../.githooks/post-commit", import.meta.url))
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "redpact-hook-"))
  directories.push(root)
  const repository = join(root, "repository")
  const bin = join(root, "bin")
  const log = join(root, "calls")
  await mkdir(repository)
  await mkdir(bin)
  await writeFile(log, "")
  await writeFile(
    join(bin, "pnpm"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$UPDATE_TEST_LOG"\nexit "$UPDATE_TEST_EXIT"\n',
  )
  await chmod(join(bin, "pnpm"), 0o755)
  const git = (...args: string[]) => exec("git", args, { cwd: repository })
  await git("init")
  await git(
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "initial",
  )
  const run = (code = "0") =>
    exec("sh", [hook], {
      cwd: repository,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        UPDATE_TEST_LOG: log,
        UPDATE_TEST_EXIT: code,
      },
    })
  return { repository, git, run, calls: () => readFile(log, "utf8") }
}

test("only opted-in clean checkouts update both runtime and plugin", async () => {
  const f = await fixture()
  await f.run()
  expect(await f.calls()).toBe("")
  await f.git("config", "redpact.autoUpdate", "true")
  await f.run()
  expect(await f.calls()).toBe("local:update:all\n")
  await writeFile(join(f.repository, "uncommitted"), "keep")
  await f.run()
  expect(await f.calls()).toBe("local:update:all\n")
})

test("update failure reports a retry command without failing the completed commit", async () => {
  const f = await fixture()
  await f.git("config", "redpact.autoUpdate", "true")
  const result = await f.run("1")
  expect(result.stderr).toContain("pnpm local:update:all")
  expect(await f.calls()).toBe("local:update:all\n")
})
