import { lstat, readdir } from "node:fs/promises"
import { join, matchesGlob } from "node:path"
import type { ExecutionScopeFiles } from "../../core/types/execution-scope.js"
import { executionChanges } from "../git/execution-changes.js"
import { discoverPlaywright } from "../playwright/catalog.js"
import { catalogPaths } from "./unit-tests.js"

async function integrationFiles(root: string, directory: string) {
  const files: string[] = []
  let entries = 0
  async function visit(path: string) {
    if ((await lstat(join(root, path))).isSymbolicLink()) {
      throw new Error("Test directory cannot contain symlinks")
    }
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      if (++entries > 5000) {
        throw new Error("Test directory exceeds 5000 entries")
      }
      if (["node_modules", ".git", ".redpact", ".codex", "dist", "coverage"].includes(entry.name)) {
        continue
      }
      const name = `${path}/${entry.name}`
      if (entry.isSymbolicLink()) {
        throw new Error("Test sources cannot contain symlinks")
      }
      if (entry.isDirectory()) {
        await visit(name)
      }
      if (entry.isFile() && /\.(test|spec)\.[jt]s$/.test(name)) {
        files.push(name)
      }
    }
  }
  await visit(directory)
  return files.sort()
}
export function createExecutionScopeFiles(): ExecutionScopeFiles {
  return {
    changes: executionChanges,
    async catalog(root, settings, input) {
      if (input.kind === "unit") {
        const unit = settings.unitTests
        if (!unit) {
          throw new Error("Configure unitTests before execution")
        }
        const files = (await catalogPaths(root, null, "all")).filter((path) =>
          unit.patterns.some((pattern) => matchesGlob(path, pattern)),
        )
        const directories = unit.patterns.map((pattern) => {
          const prefix = pattern.split(/[?*[{!(]/)[0]
          const slash = prefix.lastIndexOf("/")
          return slash < 0 ? "." : prefix.slice(0, slash) || "."
        })
        return {
          files,
          testPatterns: unit.patterns,
          directories,
          configurationDirectories: [".", unit.cwd],
        }
      }
      if (input.kind === "integration") {
        const directory = settings.tests.directory
        return {
          files: await integrationFiles(root, directory),
          testPatterns: [`${directory}/**/*.{test,spec}.{js,ts}`],
          directories: [directory],
          configurationDirectories: [".", directory],
        }
      }
      const playwright = settings.playwright
      if (!playwright || !input.target || !playwright.targets[input.target]) {
        throw new Error("Choose a declared Playwright target")
      }
      const catalog = await discoverPlaywright(root, playwright)
      return {
        files: catalog
          .filter((file) => file.target === input.target)
          .map((file) => `${playwright.directory}/${file.path}`),
        testPatterns: Object.values(playwright.targets).flatMap((target) =>
          target.testMatch.map((pattern) => `${playwright.directory}/${pattern}`),
        ),
        directories: [playwright.directory],
        configurationDirectories: [".", playwright.directory],
      }
    },
  }
}
