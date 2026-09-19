import { problem } from "../../core/problems.js"
import type { GitDiff } from "../../core/types/git.js"
import { readGit } from "./native-read.js"

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
  const patch = await readGit(root, [
    "-c",
    "core.quotePath=false",
    "diff-tree",
    "--root",
    "--no-commit-id",
    "-r",
    "-p",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--find-renames",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...(parents[0] ? [parents[0], oid] : [oid]),
    "--",
  ])
  return {
    available: true,
    revision: oid,
    ...(parents[0] ? { baseRevision: parents[0] } : {}),
    patch,
    omitted: [],
  }
}
