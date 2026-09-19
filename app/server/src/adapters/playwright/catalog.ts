import { lstat, readdir, realpath } from "node:fs/promises"
import { join, matchesGlob } from "node:path"
import { problem } from "../../core/problems.js"
import type { PlaywrightFile, PlaywrightSettings } from "../../core/types/playwright.js"

export async function discoverPlaywright(root: string, settings: PlaywrightSettings) {
  let base = await realpath(root)
  for (const part of settings.directory.split("/")) {
    base = join(base, part)
    if ((await lstat(base)).isSymbolicLink()) {
      problem("invalid_input", "Playwright directory cannot contain symlinks")
    }
  }
  const files: { path: string }[] = []
  let count = 0
  async function visit(path: string) {
    for (const entry of await readdir(join(base, path), { withFileTypes: true })) {
      if (++count > 5000) {
        problem("invalid_input", "Playwright directory exceeds 5000 entries")
      }
      if (["node_modules", ".git", ".redpact", ".codex", "dist"].includes(entry.name)) {
        continue
      }
      if (entry.isSymbolicLink()) {
        problem("invalid_input", "Playwright sources cannot contain symlinks")
      }
      const name = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await visit(name)
      }
      if (entry.isFile() && /\.[cm]?[jt]s$/.test(name)) {
        files.push({ path: name })
      }
    }
  }
  await visit("")
  files.sort((a, b) => a.path.localeCompare(b.path))
  const catalog: PlaywrightFile[] = []
  for (const file of files) {
    const targets = Object.entries(settings.targets).filter(([, target]) =>
      target.testMatch.some((pattern) => matchesGlob(file.path, pattern)),
    )
    if (targets.length > 1) {
      problem(
        "invalid_input",
        `${file.path} matches multiple Playwright targets: ${targets.map(([name]) => name).join(", ")}`,
      )
    }
    if (targets.length === 1) {
      const [target, definition] = targets[0]
      if (definition.scope === "worktree" && !file.path.startsWith("worktree/")) {
        problem(
          "invalid_input",
          `${file.path}: worktree Playwright sources must be under worktree/`,
        )
      }
      if (definition.scope === "project" && file.path.startsWith("worktree/")) {
        problem("invalid_input", `${file.path}: worktree sources cannot belong to a project target`)
      }
      catalog.push({
        path: file.path,
        target,
        purpose: definition.purpose,
        scope: definition.scope,
      })
    }
  }
  return catalog
}
