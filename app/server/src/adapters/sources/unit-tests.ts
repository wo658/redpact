import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { isAbsolute, join, matchesGlob, relative } from "node:path"
import { problem } from "../../core/problems.js"
import type { UnitTestFiles } from "../../core/types/unit-tests.js"
import { readGit } from "../git/native-read.js"

async function contained(root: string, path: string) {
  if (
    path !== "." &&
    (isAbsolute(path) ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === ".."))
  ) {
    problem("invalid_input", "Use a project-relative path without traversal")
  }
  const canonical = await realpath(root)
  const target = await realpath(join(canonical, path))
  const rel = relative(canonical, target)
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../")) {
    problem("invalid_input", "Path escapes the selected project")
  }
  return target
}
export function createUnitTestFiles(): UnitTestFiles {
  return {
    async directory(root, cwd) {
      const path = await contained(root, cwd)
      if (!(await lstat(path)).isDirectory()) {
        problem("invalid_input", "Command cwd must be a directory")
      }
      return path
    },
    async catalog(root, base, patterns, directory, scope = "changed") {
      const paths = await catalogPaths(root, base, scope)
      const files = [...paths]
        .sort()
        .filter((path) => matchesTestPath(path, patterns, directory))
        .map((path) => ({ path }))
      return {
        ...(scope === "changed" && base ? { baseRevision: base } : {}),
        files,
        diagnostics: [],
      }
    },
    async source(root, path, patterns, directory) {
      if (
        !matchesTestPath(path, patterns, directory) ||
        !(await catalogPaths(root, null, "all")).includes(path)
      ) {
        problem("invalid_input", "Select a file from the configured test catalog")
      }
      try {
        const target = await contained(root, path)
        if ((await lstat(join(root, path))).isSymbolicLink()) {
          throw new Error("Symlinked test files cannot be previewed")
        }
        const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const info = await handle.stat()
          if (!info.isFile() || info.size > 200000) {
            throw new Error("Source preview exceeds its size limit")
          }
          const content = Buffer.alloc(200001)
          let bytes = 0
          while (bytes < content.length) {
            const read = await handle.read(content, bytes, content.length - bytes, bytes)
            if (!read.bytesRead) {
              break
            }
            bytes += read.bytesRead
          }
          if (bytes > 200000) {
            throw new Error("Source preview exceeds its size limit")
          }
          const source = content.subarray(0, bytes).toString("utf8")
          if (source.includes("\0")) {
            throw new Error("Binary source cannot be previewed")
          }
          return { path, source }
        } finally {
          await handle.close()
        }
      } catch (error) {
        return {
          path,
          source: null,
          issue: error instanceof Error ? error.message : "Source unavailable",
        }
      }
    },
  }
}

export async function catalogPaths(root: string, base: string | null, scope: "changed" | "all") {
  if (scope === "all") {
    const [listed, deleted] = await Promise.all([
      readGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."]),
      readGit(root, ["ls-files", "--deleted", "-z", "--", "."]),
    ])
    const removed = new Set(deleted.split("\0"))
    return [...new Set(listed.split("\0").filter((path) => path && !removed.has(path)))]
  }
  if (!base) {
    problem("invalid_input", "Changed test files require a Git comparison")
  }
  const prefix = (await readGit(root, ["rev-parse", "--show-prefix"])).replace(/\n$/, "")
  const changed = await readGit(root, [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=AMR",
    "--find-renames",
    base,
    "--",
    ".",
  ])
  const changedPaths = new Set(changed.split("\0"))
  const untracked = await readGit(root, ["ls-files", "--others", "--exclude-standard", "-z"])
  const paths = new Set([
    ...changed
      .split("\0")
      .filter(Boolean)
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length)),
    ...untracked.split("\0").filter(Boolean),
  ])
  const baseline = new Set(
    (
      await readGit(root, ["ls-tree", "-r", "--name-only", "--full-name", "-z", base, "--", "."])
    ).split("\0"),
  )
  return [...paths].filter(
    (path) => changedPaths.has(prefix + path) || !baseline.has(prefix + path),
  )
}

function matchesTestPath(path: string, patterns: string[], directory?: string) {
  return (
    (!directory || path.startsWith(`${directory}/`)) &&
    patterns.some((pattern) => matchesGlob(path, pattern))
  )
}
