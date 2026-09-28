import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, readdir, realpath, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

export function contained(root: string, path: string) {
  const rel = relative(root, path)
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error("Input escapes project root")
  }
  return path
}
export async function projectFile(root: string, path: string) {
  if (isAbsolute(path)) {
    throw new Error("Use project-relative inputs")
  }
  return contained(await realpath(root), await realpath(resolve(root, path)))
}
const excluded = new Set([
  ".git",
  ".codex",
  "node_modules",
  ".pnpm-store",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".env",
])
export async function snapshotInputs(
  root: string,
  destination?: string,
  options: { rejectExcluded?: boolean } = {},
): Promise<string> {
  const hash = createHash("sha256")
  async function walk(directory: string) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (excluded.has(entry.name) || entry.name.startsWith(".env.")) {
        if (options.rejectExcluded) {
          throw new Error(
            `Cannot remove unrecorded input: ${relative(root, join(directory, entry.name))}`,
          )
        }
        continue
      }
      const path = join(directory, entry.name)
      const rel = relative(root, path)
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are unsupported in environment inputs: ${rel}`)
      }
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`Input is not a regular file: ${rel}`)
      }
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      let data: Buffer
      let mode: number
      try {
        const stat = await handle.stat()
        if (!stat.isFile()) {
          throw new Error(`Input changed type: ${rel}`)
        }
        mode = stat.mode & 0o777
        data = await handle.readFile()
        if (data.length !== stat.size) {
          throw new Error(`Input changed while being copied: ${rel}`)
        }
      } finally {
        await handle.close()
      }
      hash.update(JSON.stringify([rel, mode, data.length])).update(data)
      if (destination) {
        const target = join(destination, rel)
        await mkdir(dirname(target), { recursive: true, mode: 0o700 })
        await writeFile(target, data, { flag: "wx", mode })
      }
    }
  }
  await walk(root)
  return hash.digest("hex")
}
