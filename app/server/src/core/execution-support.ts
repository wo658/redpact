import { matchesGlob } from "node:path"

export function executionSupportingPaths(input: {
  changedPaths: string[]
  testPatterns: string[]
  directories: string[]
  configurationDirectories: string[]
}): string[] {
  return [...new Set(input.changedPaths)]
    .filter((path) => {
      if (input.testPatterns.some((pattern) => matchesGlob(path, pattern))) {
        return false
      }
      if (path === ".redpact/settings.json") {
        return true
      }
      if (
        input.directories.some((directory) => directory === "." || path.startsWith(`${directory}/`))
      ) {
        return true
      }
      const slash = path.lastIndexOf("/")
      const directory = slash < 0 ? "." : path.slice(0, slash)
      const name = path.slice(slash + 1)
      return (
        input.configurationDirectories.includes(directory) &&
        ([
          "package.json",
          "pnpm-lock.yaml",
          "package-lock.json",
          "yarn.lock",
          ".gitignore",
        ].includes(name) ||
          /^(?:tsconfig(?:\.[^.]+)?\.json|(?:vitest|vite|playwright|jest)\.config\.[cm]?[jt]s)$/.test(
            name,
          ))
      )
    })
    .sort()
}
