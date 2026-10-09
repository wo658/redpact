import type { GitAdapter } from "../../core/types/git.js"
import { createGitContent } from "./content.js"
import { createGitMetadata } from "./metadata.js"
import { createGitStatus } from "./status.js"

export function createGitAdapter(): GitAdapter {
  const status = createGitStatus()
  return { ...createGitMetadata(), ...status, ...createGitContent(status) }
}
