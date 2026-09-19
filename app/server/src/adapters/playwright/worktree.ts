import { randomUUID } from "node:crypto"
import { lstat, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import type { CaptureRun } from "../../core/types/playwright.js"
import { projectFile, snapshotInputs } from "../environment/inputs.js"

export async function cleanupPlaywrightWorktree(directory: string, run: CaptureRun) {
  const sources = join(directory, "playwright-runs", run.id, "sources")
  if (
    (await lstat(sources)).isSymbolicLink() ||
    (await snapshotInputs(sources)) !== run.sourceDigest
  ) {
    throw new Error("Captured source identity mismatch")
  }
  const base = await projectFile(run.projectRoot, run.settings.directory)
  let component = run.projectRoot
  for (const part of run.settings.directory.split("/")) {
    component = join(component, part)
    if ((await lstat(component)).isSymbolicLink()) {
      throw new Error("Worktree source directory cannot contain symlinks")
    }
  }
  const worktree = join(base, "worktree")
  const stat = await lstat(worktree).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null
    }
    throw error
  })
  if (!stat) {
    return
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Worktree sources must be a regular directory")
  }
  const digest = await snapshotInputs(join(sources, "worktree"))
  if ((await snapshotInputs(worktree, undefined, { rejectExcluded: true })) !== digest) {
    throw new Error("Worktree sources changed since recording; run them again before cleanup")
  }
  const parked = join(base, `.worktree-cleanup-${randomUUID()}`)
  await rename(worktree, parked)
  try {
    if ((await snapshotInputs(parked, undefined, { rejectExcluded: true })) !== digest) {
      throw new Error("Worktree sources changed during cleanup")
    }
  } catch (error) {
    const replacement = await lstat(worktree).catch(() => null)
    if (replacement) {
      throw new Error(`Worktree sources changed; recover preserved files from ${parked}`)
    }
    await rename(parked, worktree)
    throw error
  }
  await rm(parked, { recursive: true })
}
