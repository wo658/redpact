import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execa } from "execa"
import { expect, test } from "vitest"
import { createCaptureBaselineCleanup } from "../src/adapters/playwright/baseline.js"
import type { CaptureRun } from "../src/core/types/playwright.js"

test("기존 비교 리소스를 정리해도 현재 미커밋 변경을 보존한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "capture-base-"))
  const git = async (...args: string[]) =>
    (await execa("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args])).stdout.trim()
  try {
    await git("init", "-b", "main")
    await git("config", "user.name", "Test")
    await git("config", "user.email", "test@example.invalid")
    await writeFile(join(root, "screen.txt"), "before")
    await git("add", ".")
    await git("commit", "-m", "base")
    const baseRevision = await git("rev-parse", "HEAD")
    await writeFile(join(root, "screen.txt"), "after local edits")
    const baseline = createCaptureBaselineCleanup(join(root, "runtime")),
      run = { id: randomUUID(), projectRoot: root, baseRevision } as CaptureRun
    const path = join(root, "runtime/playwright-baselines", run.id)
    await mkdir(join(root, "runtime/playwright-baselines"), { recursive: true })
    await git("worktree", "add", "--detach", path, baseRevision)
    expect(await readFile(join(path, "screen.txt"), "utf8")).toBe("before")
    expect(await readFile(join(root, "screen.txt"), "utf8")).toBe("after local edits")
    await baseline.remove(run)
    expect(await git("worktree", "list", "--porcelain")).not.toContain(path)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
