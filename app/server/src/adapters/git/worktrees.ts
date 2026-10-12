import { execFile } from "node:child_process"
import { lstat, mkdir, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import { problem } from "../../core/problems.js"
import type { WorktreeAdapter } from "../../core/types/start-work.js"

const execute = promisify(execFile)
export function createWorktreeAdapter(): WorktreeAdapter {
  async function git(commonGitdir: string, args: string[]) {
    // Ignore inherited repository overrides; never use a shell or execute checkout hooks.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    )
    const result = await execute(
      "git",
      ["--git-dir", commonGitdir, "-c", "core.hooksPath=/dev/null", ...args],
      {
        env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    return result.stdout
  }
  async function vacant(commonGitdir: string, path: string, branch: string) {
    try {
      await lstat(path)
      problem("work_start_conflict", `Destination already exists: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
    const refs = await git(commonGitdir, ["for-each-ref", "--format=%(refname)", "refs/heads/"])
    if (
      refs
        .split("\n")
        .some(
          (ref) =>
            ref === `refs/heads/${branch}` ||
            ref.startsWith(`refs/heads/${branch}/`) ||
            (`refs/heads/${branch}`.startsWith(`${ref}/`) && ref !== ""),
        )
    ) {
      problem("work_start_conflict", `Branch already exists or conflicts: ${branch}`)
    }
    const worktrees = await git(commonGitdir, ["worktree", "list", "--porcelain", "-z"])
    if (worktrees.split("\0").includes(`worktree ${path}`)) {
      problem("work_start_conflict", `Destination is already registered with Git: ${path}`)
    }
  }
  return {
    async plan(commonGitdir, input) {
      try {
        if (
          (await git(commonGitdir, ["check-ref-format", "--branch", input.branch])).trim() !==
          input.branch
        ) {
          problem("invalid_input", "Use a literal branch name, not checkout shorthand")
        }
      } catch (error) {
        if (typeof (error as NodeJS.ErrnoException).code === "number") {
          problem("invalid_input", "Invalid literal branch name")
        }
        throw error
      }
      let parent: string
      try {
        parent = await realpath(dirname(input.path))
      } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes(String((error as NodeJS.ErrnoException).code))) {
          problem("invalid_input", "Destination parent directory must exist")
        }
        throw error
      }
      const checkoutRoot = join(parent, basename(input.path))
      await vacant(commonGitdir, checkoutRoot, input.branch)
      let revision: string
      try {
        revision = (
          await git(commonGitdir, [
            "rev-parse",
            "--verify",
            "--end-of-options",
            `${input.baseRef}^{commit}`,
          ])
        ).trim()
      } catch (error) {
        if (typeof (error as NodeJS.ErrnoException).code === "number") {
          problem("invalid_input", "baseRef must resolve to a local commit")
        }
        throw error
      }
      return { checkoutRoot, revision }
    },
    async create(commonGitdir, request) {
      await vacant(commonGitdir, request.checkoutRoot, request.input.branch)
      await mkdir(request.checkoutRoot)
      await git(commonGitdir, [
        "worktree",
        "add",
        "--no-track",
        "-b",
        request.input.branch,
        "--",
        request.checkoutRoot,
        request.revision,
      ])
    },
  }
}
