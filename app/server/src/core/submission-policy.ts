import { createHash } from "node:crypto"
import { problem } from "./problems.js"
import { testPackage } from "./test-package.js"
import type { SourceFile } from "./types/contracts.js"

export function prepareSubmissionSources(files: SourceFile[], runnerVersion: string) {
  const paths = new Set<string>()
  for (const file of files) {
    if (
      !["package.json", "pnpm-lock.yaml"].includes(file.path) &&
      (!/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*\.(ts|js|json)$/.test(file.path) ||
        file.path.split("/").some((part) => part === ".." || part === "." || !part) ||
        file.path.includes("node_modules") ||
        file.path.includes("config.") ||
        file.path.endsWith("package.json"))
    ) {
      problem(
        "invalid_input",
        "Only relative source paths are accepted; package/config files are managed by the runner",
      )
    }
    if (paths.has(file.path)) {
      problem("invalid_input", "Duplicate file path")
    }
    paths.add(file.path)
  }
  if (!files.length || !files.some((file) => /\.(test|spec)\.[jt]s$/.test(file.path))) {
    problem("invalid_input", "At least one test file is required")
  }
  try {
    testPackage(files)
  } catch {
    problem(
      "invalid_input",
      "Supply a pinned pnpm@11.2.2 manifest and lockfile; custom package configuration is unsupported",
    )
  }
  const sorted = files.map((file) => ({ ...file })).sort((a, b) => a.path.localeCompare(b.path))
  return {
    files: sorted,
    digest: createHash("sha256")
      .update(JSON.stringify({ files: sorted, runnerVersion }))
      .digest("hex"),
  }
}
