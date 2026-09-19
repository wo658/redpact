import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import { problem } from "../../core/problems.js"
import type { SourceFile } from "../../core/types/contracts.js"
import type { LocalFiles } from "../../core/types/local-files.js"
import { createSettingsService } from "../settings/json.js"

const ignored = new Set(["node_modules", ".git", ".redpact", ".codex", "dist", "coverage"])
export function createLocalFiles(
  settings: LocalFiles["settings"] = createSettingsService,
): LocalFiles {
  return {
    settings,
    async readTests(root, directory, tests) {
      const canonical = await realpath(root)
      const base = join(canonical, directory)
      let current = canonical
      for (const part of directory.split("/")) {
        current = join(current, part)
        if ((await lstat(current)).isSymbolicLink()) {
          problem("invalid_input", "Test directory must not contain symlinks")
        }
      }
      const resolved = await realpath(base)
      const within = relative(canonical, resolved)
      if (within.startsWith("..") || isAbsolute(within)) {
        problem("invalid_input", "Test directory escapes the project")
      }
      const files: SourceFile[] = []
      let bytes = 0
      let entries = 0
      async function visit(path: string) {
        const children = await readdir(join(base, path), { withFileTypes: true })
        for (const entry of children.sort((a, b) => a.name.localeCompare(b.name))) {
          if (++entries > 5000) {
            problem("invalid_input", "Test directory exceeds 5000 entries")
          }
          if (ignored.has(entry.name)) {
            continue
          }
          const name = path ? `${path}/${entry.name}` : entry.name
          if (entry.isSymbolicLink()) {
            problem("invalid_input", `Symlinked test input is unsupported: ${name}`)
          }
          if (entry.isDirectory()) {
            await visit(name)
            continue
          }
          if (!entry.isFile() || !(/\.(ts|js|json)$/.test(name) || name === "pnpm-lock.yaml")) {
            continue
          }
          if (tests && /\.(test|spec)\.[jt]s$/.test(name) && !tests.includes(name)) {
            continue
          }
          const handle = await open(join(base, name), constants.O_RDONLY | constants.O_NOFOLLOW)
          try {
            const info = await handle.stat()
            if (
              !info.isFile() ||
              info.size > 200000 ||
              files.length >= 50 ||
              bytes + info.size > 2000000
            ) {
              problem(
                "invalid_input",
                "Test bundle exceeds 50 files, 200 KB per file or 2 MB total",
              )
            }
            const source = await handle.readFile("utf8")
            bytes += Buffer.byteLength(source)
            if (bytes > 2000000 || Buffer.byteLength(source) > 200000) {
              problem("invalid_input", "Test input changed beyond its size limit")
            }
            files.push({ path: name, source })
          } finally {
            await handle.close()
          }
        }
      }
      await visit("")
      for (const test of tests ?? []) {
        if (!/\.(test|spec)\.[jt]s$/.test(test) || !files.some((file) => file.path === test)) {
          problem("invalid_input", `Selected test was not found: ${test}`)
        }
      }
      if (!files.some((file) => /\.(test|spec)\.[jt]s$/.test(file.path))) {
        problem("invalid_input", "No test files found in tests.directory")
      }
      return files.sort((a, b) => a.path.localeCompare(b.path))
    },
  }
}
