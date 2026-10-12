import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, mkdir, readFile, readlink, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { problem } from "../../core/problems.js"
import type { GitMutations, Uncommitted, UncommittedFile } from "../../core/types/merge.js"
import { captureGit } from "./capture.js"
import { createGitAdapter } from "./isomorphic.js"

const limit = 2 * 1024 * 1024
function environment() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_LITERAL_PATHSPECS: "1",
  }
}
async function git(root: string, args: string[]) {
  return (
    await captureGit(["-C", root, "-c", "core.quotePath=false", ...args], environment(), limit)
  ).stdout
}
const execute = promisify(execFile)
async function mutateGit(root: string, args: string[]) {
  // Never replay a mutation after an uncertain process/transport failure.
  return (
    await execute("git", ["-C", root, "-c", "core.quotePath=false", ...args], {
      env: environment(),
      timeout: 10000,
      maxBuffer: limit,
    })
  ).stdout
}
async function optionalRevision(root: string, args: string[]) {
  try {
    return (await git(root, args)).trim() || null
  } catch {
    return null
  }
}
async function exists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false
    }
    throw error
  }
}
async function fileDigest(root: string, path: string) {
  const parts = path.split("/")
  if (
    parts.some((part) => !part || part === ".." || part === "." || part.toLowerCase() === ".git")
  ) {
    problem("invalid_input", "Unsafe Git path")
  }
  let parent = root
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part)
    if ((await exists(parent)) && (await lstat(parent)).isSymbolicLink()) {
      problem("worktree_busy", "A changed file has a symlink parent; resolve it in Git first")
    }
  }
  const full = join(root, path)
  if (!(await exists(full))) {
    return "missing"
  }
  const info = await lstat(full)
  if (info.isSymbolicLink()) {
    return `link:${await readlink(full)}`
  }
  if (!info.isFile()) {
    problem("worktree_busy", "Changed directories and submodules must be resolved in Git first")
  }
  const hash = createHash("sha256").update(String(info.mode))
  for await (const chunk of createReadStream(full)) {
    hash.update(chunk)
  }
  return hash.digest("hex")
}
function parseStatus(status: string): UncommittedFile[] {
  return status
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({
      path: entry.slice(3),
      staged: entry[0] !== " " && entry[0] !== "?",
      unstaged: entry[1] !== " " && entry[1] !== "?",
      untracked: entry.startsWith("??"),
    }))
}

export function createGitMutations(): GitMutations {
  const reader = createGitAdapter()
  async function inspect(directory: string): Promise<Uncommitted> {
    const root = (await git(directory, ["rev-parse", "--show-toplevel"])).trim()
    const gitdir = (await git(root, ["rev-parse", "--absolute-git-dir"])).trim()
    const commonGitdir = resolve(root, (await git(root, ["rev-parse", "--git-common-dir"])).trim())
    const head = await optionalRevision(root, ["rev-parse", "--verify", "HEAD"])
    const branch = await optionalRevision(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])
    const status = await git(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
      "--no-renames",
    ])
    const files = parseStatus(status)
    if (files.length > 1000) {
      problem("worktree_busy", "More than 1000 changed files; organize changes in Git first")
    }
    const hash = createHash("sha256").update(JSON.stringify({ root, head, branch, status }))
    if (await exists(join(gitdir, "index"))) {
      hash.update(await readFile(join(gitdir, "index")))
    }
    for (const file of files) {
      hash.update(file.path).update(await fileDigest(root, file.path))
    }
    const markers = [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
      "BISECT_LOG",
      "index.lock",
    ]
    let blockedReason: string | null = null
    for (const marker of markers) {
      if (await exists(join(gitdir, marker))) {
        blockedReason = "Another Git operation is in progress; finish it in Git first"
      }
    }
    if (!head) {
      blockedReason = "Create the initial commit in Git first"
    }
    if (!branch) {
      blockedReason = "Check out a branch before changing this worktree"
    }
    hash.update(blockedReason ?? "")
    const staged = await reader.diff(root, "staged")
    const unstaged = await reader.diff(root, "unstaged")
    return {
      root,
      commonGitdir,
      head,
      branch,
      revision: hash.digest("hex"),
      dirty: files.length > 0,
      blockedReason,
      files,
      staged,
      unstaged,
    }
  }
  async function checked(root: string, revision: string) {
    const current = await inspect(root)
    if (current.revision !== revision) {
      problem("worktree_busy", "Changes have changed since inspection; review them again")
    }
    if (current.blockedReason) {
      problem("worktree_busy", current.blockedReason)
    }
    return current
  }
  return {
    currentBranch: (root) => reader.currentBranch(root),
    inspect,
    async commit(root, revision, message) {
      if (!message.trim() || message.length > 10000 || message.includes("\0")) {
        problem("invalid_input", "A commit message is required")
      }
      const current = await checked(root, revision)
      if (!current.dirty) {
        problem("worktree_busy", "There are no uncommitted changes")
      }
      await mutateGit(root, ["add", "-A", "--", ...current.files.map((file) => file.path)])
      await mutateGit(root, ["commit", "-m", message])
      return inspect(root)
    },
    async discard(root, revision) {
      const current = await checked(root, revision)
      const tracked = current.files.filter((file) => !file.untracked).map((file) => file.path)
      if (tracked.length) {
        await mutateGit(root, [
          "restore",
          "--source=HEAD",
          "--staged",
          "--worktree",
          "--",
          ...tracked,
        ])
      }
      for (const file of current.files.filter((file) => file.untracked)) {
        await rm(join(root, file.path), { force: true })
      }
      return inspect(root)
    },
    async candidate(root, path, targetHead, sourceHead) {
      await mkdir(dirname(path), { recursive: true })
      await mutateGit(root, ["worktree", "add", "--detach", path, targetHead])
      try {
        const output = await mutateGit(path, [
          "merge",
          "--no-ff",
          "--no-edit",
          "--no-commit",
          sourceHead,
        ])
        const merged = await optionalRevision(path, ["rev-parse", "--verify", "MERGE_HEAD"])
        if (merged) {
          await mutateGit(path, ["commit", "-m", `Merge ${sourceHead} via Redpact`])
        }
        return { head: (await git(path, ["rev-parse", "HEAD"])).trim(), conflicts: [], output }
      } catch (error) {
        const conflicts = (await git(path, ["diff", "--name-only", "--diff-filter=U", "-z"]))
          .split("\0")
          .filter(Boolean)
        if (!conflicts.length) {
          throw error
        }
        return {
          head: null,
          conflicts,
          output: String((error as { stdout?: string }).stdout ?? ""),
        }
      }
    },
    async publish(root, expected, head) {
      const current = await checked(root, expected.revision)
      if (current.dirty || current.head !== expected.head || current.branch !== expected.branch) {
        problem("worktree_busy", "The target worktree changed; retry the merge")
      }
      await mutateGit(root, ["merge", "--ff-only", "--no-edit", head])
    },
    async remove(root, path) {
      await mutateGit(root, ["worktree", "remove", "--force", path])
    },
  }
}
