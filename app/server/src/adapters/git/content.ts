import { isAbsolute } from "node:path"
import git from "isomorphic-git"
import type { GitContentAdapter, GitStatusAdapter } from "../../core/types/git.js"
import { comparisonBase } from "./comparison-base.js"
import { gitContext as context, gitRevision as revision } from "./context.js"
import { readDiff } from "./diff.js"
import { readImage } from "./image.js"
import { nativeIndexFile, needsNativeIndex } from "./native-index.js"

export function createGitContent(status: Pick<GitStatusAdapter, "inspect">): GitContentAdapter {
  return {
    image: readImage,
    async mergeBase(projectPath, mainBranch) {
      const ctx = await context(projectPath)
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      )
      return comparisonBase(ctx.root, await revision(ctx), mainBranch, env)
    },
    async diff(projectPath, scope, mainBranch) {
      return readDiff(await status.inspect(projectPath), scope, mainBranch)
    },
    async readFile(projectPath, path, source) {
      if (
        !path ||
        isAbsolute(path) ||
        path.includes("\\") ||
        path.split("/").some((p) => !p || p === "." || p === "..")
      ) {
        throw new Error("Git file paths must be repository-relative without traversal")
      }
      const ctx = await context(projectPath)
      let oid: string | null = null
      if (source === "head") {
        const head = await revision(ctx)
        if (!head) {
          return null
        }
        try {
          const result = await git.readBlob({ ...ctx.args, oid: head, filepath: path })
          return Buffer.from(result.blob).toString("utf8")
        } catch (error) {
          if ((error as { code?: string }).code === "NotFoundError") {
            return null
          }
          throw error
        }
      }
      if (await needsNativeIndex(ctx.gitdir)) {
        return nativeIndexFile(ctx.root, path)
      }
      await git.walk({
        ...ctx.args,
        trees: [git.STAGE()],
        map: async (filepath, [entry]) => {
          if (filepath === path && entry && (await entry.type()) === "blob") {
            oid = await entry.oid()
          }
        },
      })
      if (!oid) {
        return null
      }
      const result = await git.readBlob({ ...ctx.args, oid })
      return Buffer.from(result.blob).toString("utf8")
    },
  }
}
