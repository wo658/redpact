import { lstat } from "node:fs/promises"
import { join } from "node:path"
import type { GitDiff, GitScope, GitSnapshot } from "../../core/types/git.js"
import { captureGit } from "./capture.js"
import { comparisonBase } from "./comparison-base.js"
import { isImagePath } from "./image-formats.js"

const limit = 2 * 1024 * 1024
export async function readDiff(
  snapshot: GitSnapshot,
  scope: GitScope,
  mainBranch?: string | null,
): Promise<GitDiff> {
  if (!snapshot.available) {
    return { available: false, reason: snapshot.reason, patch: "", omitted: [] }
  }
  const root = snapshot.root
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  )
  async function diff(args: string[], noIndex = false) {
    try {
      return (
        await captureGit(
          [
            "-C",
            root,
            "-c",
            "core.quotePath=false",
            "-c",
            "color.ui=false",
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            ...args,
          ],
          {
            ...env,
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
            GIT_LITERAL_PATHSPECS: "1",
          },
          limit,
        )
      ).stdout
    } catch (error) {
      const result = error as { code?: number; stdout?: string }
      if (noIndex && result.code === 1 && typeof result.stdout === "string") {
        return result.stdout
      }
      throw error
    }
  }
  try {
    const baseRevision =
      scope === "all" && mainBranch !== undefined
        ? await comparisonBase(root, snapshot.revision, mainBranch, env)
        : undefined
    const diffArgs: string[] = []
    if (scope === "staged") {
      diffArgs.push("--cached")
    } else if (scope === "all") {
      diffArgs.push(baseRevision ?? "HEAD")
    }
    let patch = scope === "all" && !snapshot.revision ? "" : await diff(diffArgs)
    const omitted: string[] = []
    const additions = snapshot.changes.filter(
      (change) =>
        scope !== "staged" &&
        change.worktree !== 0 &&
        ((scope === "all" && !snapshot.revision) || (change.head === 0 && change.stage === 0)),
    )
    for (const change of additions) {
      if (additions.indexOf(change) >= 100) {
        omitted.push(`${change.path}: untracked file preview limit`)
        continue
      }
      const info = await lstat(join(snapshot.root, change.path))
      if (!info.isFile() || info.size > (isImagePath(change.path) ? 5 * 1024 * 1024 : 512 * 1024)) {
        omitted.push(
          `${change.path}: non-regular file or larger than ${isImagePath(change.path) ? "5 MiB" : "512 KiB"}`,
        )
        continue
      }
      const next = await diff(["--no-index", "--", "/dev/null", change.path], true)
      if (patch.length + next.length > limit) {
        omitted.push(`${change.path}: diff size limit`)
        continue
      }
      patch += next
    }
    return {
      available: true,
      revision: snapshot.revision,
      ...(baseRevision ? { baseRevision } : {}),
      patch,
      omitted,
    }
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "Git diff unavailable",
      patch: "",
      omitted: [],
    }
  }
}
