import * as fs from "node:fs"
import { readFile, realpath, stat } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import git from "isomorphic-git"

async function optionalText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}
export async function gitContext(projectPath: string) {
  const root = await realpath(await git.findRoot({ fs, filepath: resolve(projectPath) }))
  let gitdir = join(root, ".git")
  if ((await stat(gitdir)).isFile()) {
    const pointer = (await optionalText(gitdir))?.trim().match(/^gitdir:\s*(.+)$/i)
    if (!pointer) {
      throw new Error("Invalid Git directory pointer")
    }
    gitdir = resolve(dirname(gitdir), pointer[1])
  }
  gitdir = await realpath(gitdir)
  const common = await optionalText(join(gitdir, "commondir"))
  const commonGitdir = await realpath(common?.trim() ? resolve(gitdir, common.trim()) : gitdir)
  // Worktrees share objects and refs, but must retain their own HEAD and index.
  const shared = new Set(["objects", "refs", "config", "packed-refs", "shallow", "info"])
  const promises = new Proxy(fs.promises, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (!["readFile", "stat", "lstat", "readdir", "readlink"].includes(String(property))) {
        return value
      }
      return async (filepath: string, ...args: unknown[]) => {
        const path = relative(gitdir, filepath)
        return value.call(
          target,
          shared.has(path.split(sep)[0]) ? join(commonGitdir, path) : filepath,
          ...args,
        )
      }
    },
  })
  return { root, gitdir, commonGitdir, args: { fs: { promises }, dir: root, gitdir } }
}
export async function gitRevision(ctx: Awaited<ReturnType<typeof gitContext>>) {
  const head = await optionalText(join(ctx.gitdir, "HEAD"))
  if (!head) {
    throw new Error("Missing Git HEAD")
  }
  try {
    return await git.resolveRef({ ...ctx.args, ref: "HEAD" })
  } catch (error) {
    // Only an absent symbolic branch is an unborn repository.
    if (
      head.startsWith("ref: refs/heads/") &&
      (error as { code?: string }).code === "NotFoundError"
    ) {
      return null
    }
    throw error
  }
}
