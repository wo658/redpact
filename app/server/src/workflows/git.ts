import type { GitAdapter, GitService } from "../core/types/git.js"

export function createGitService(
  projectPath: string,
  adapter: Pick<GitAdapter, "image" | "diff" | "inspect" | "readFile" | "mergeBase">,
): GitService {
  return {
    image: (path, mainBranch, options) => adapter.image(projectPath, path, mainBranch, options),
    mergeBase: (mainBranch = null) => adapter.mergeBase(projectPath, mainBranch),
    diff: (scope, mainBranch) => adapter.diff(projectPath, scope, mainBranch),
    inspect: () => adapter.inspect(projectPath),
    readFile: (path: string, source: "head" | "index" = "head") =>
      adapter.readFile(projectPath, path, source),
  }
}
