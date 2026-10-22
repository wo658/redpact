import { problem } from "../../core/problems.js"
import type { GitDiff } from "../../core/types/git.js"
import { readGit } from "./native-read.js"
import { gitOutputLimitMiB } from "./output-limit.js"

export async function readCommitDiff(root: string, oid: string): Promise<GitDiff> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) {
    problem("invalid_input", "A full commit object ID is required")
  }
  try {
    const type = (await readGit(root, ["cat-file", "-t", oid])).trim()
    if (type !== "commit") {
      problem("not_found", "Commit not found")
    }
  } catch (error) {
    if ((error as { code?: number }).code === 128) {
      problem("not_found", "Commit not found")
    }
    throw error
  }
  const parents = (await readGit(root, ["show", "-s", "--format=%P", oid, "--"]))
    .trim()
    .split(" ")
    .filter(Boolean)
  const args = [
    "-c",
    "core.quotePath=false",
    "diff-tree",
    "--root",
    "--no-commit-id",
    "-r",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--find-renames",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...(parents[0] ? [parents[0], oid] : [oid]),
    "--",
  ]
  const limit = gitOutputLimitMiB()
  const metadata = {
    available: true,
    revision: oid,
    ...(parents[0] ? { baseRevision: parents[0] } : {}),
  }
  try {
    const patch = await readGit(root, [...args.slice(0, -1), "-p", "--"])
    return { ...metadata, patch, omitted: [] }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw error
    }
  }
  // Read names independently: a truncated patch cannot reliably describe all changed files.
  const partial = { ...metadata, patch: "", patchOmitted: "size_limit" as const }
  try {
    const names = await readGit(root, [...args.slice(0, -1), "--name-only", "-z", "--"])
    return {
      ...partial,
      changedPaths: names.split("\0").filter(Boolean),
      omitted: [`Patch exceeds the ${limit} MiB display limit. Only changed file paths are shown.`],
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw error
    }
    return {
      ...partial,
      changedPathsOmitted: "size_limit",
      omitted: [
        `Patch and file list exceed their ${limit} MiB display limits. Only commit metadata is shown.`,
      ],
    }
  }
}
