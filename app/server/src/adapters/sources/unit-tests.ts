import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { isAbsolute, join, matchesGlob, relative } from "node:path"
import { problem } from "../../core/problems.js"
import type { UnitCatalog, UnitTestFiles } from "../../core/types/unit-tests.js"
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
      const files: UnitCatalog["files"] = []
      const diagnostics: string[] = []
      let bytes = 0
      for (const path of [...paths]
        .sort()
        .filter(
          (path) =>
            (!directory || path.startsWith(`${directory}/`)) &&
            patterns.some((pattern) => matchesGlob(path, pattern)),
        )) {
        if (files.length >= 200) {
          diagnostics.push(
            scope === "all"
              ? "Only the first 200 test files are shown"
              : "Only the first 200 changed test files are shown",
          )
          break
        }
        try {
          const target = await contained(root, path)
          if ((await lstat(join(root, path))).isSymbolicLink()) {
            throw new Error("Symlinked test files cannot be previewed")
          }
          const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
          try {
            const info = await handle.stat()
            if (!info.isFile() || info.size > 200000 || bytes + info.size > 2000000) {
              throw new Error("Source preview exceeds its size limit")
            }
            const content = Buffer.alloc(Math.min(info.size + 1, 200001))
            const read = await handle.read(content, 0, content.length, 0)
            bytes += read.bytesRead
            if (read.bytesRead > 200000 || bytes > 2000000) {
              throw new Error("Source preview exceeds its size limit")
            }
            const source = content.subarray(0, read.bytesRead).toString("utf8")
            if (source.includes("\0")) {
              throw new Error("Binary source cannot be previewed")
            }
            files.push({ path, source })
          } finally {
            await handle.close()
          }
        } catch (error) {
          files.push({
            path,
            source: null,
            issue: error instanceof Error ? error.message : "Source unavailable",
          })
        }
      }
      return { ...(scope === "changed" && base ? { baseRevision: base } : {}), files, diagnostics }
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
