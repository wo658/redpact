import { existsSync } from "node:fs"
import { join } from "node:path"
import { execa } from "execa"
import type { CaptureBaselineCleanup } from "../../core/types/playwright.js"
import { minimalEnvironment } from "../environment/testcontainers.js"
export function createCaptureBaselineCleanup(directory: string): CaptureBaselineCleanup {
  const root = join(directory, "playwright-baselines")
  async function git(project: string, args: string[]) {
    return (
      await execa("git", ["-C", project, "-c", "core.hooksPath=/dev/null", ...args], {
        env: { ...minimalEnvironment(), GIT_TERMINAL_PROMPT: "0" },
        extendEnv: false,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout.trim()
  }
  return {
    async remove(run) {
      const path = join(root, run.id)
      if (!existsSync(path)) {
        return
      }
      if ((await git(path, ["rev-parse", "HEAD"])) !== run.baseRevision) {
        throw new Error("Baseline changed; cleanup requires inspection")
      }
      await git(run.projectRoot, ["worktree", "remove", path])
    },
  }
}
