import type { Worktree } from "./contracts.js"
import type { Environment } from "./environment.js"
import type { ProjectEntry } from "./project-files.js"

export type TestContainerInspection = {
  composeFiles: string[]
  target: Worktree | null
  environment: Environment | null
  changed: boolean | null
  issue: string | null
}
export type TestContainer = {
  busy(projectId: string): boolean
  composeSource(projectId: string, path: string, worktreeId?: string): Promise<ProjectEntry>
  inspect(projectId: string, worktreeId?: string): Promise<TestContainerInspection>
  start(projectId: string, worktreeId?: string): Promise<TestContainerInspection>
  restart(projectId: string, worktreeId?: string): Promise<TestContainerInspection>
  stop(projectId: string, worktreeId?: string): Promise<TestContainerInspection>
  close(): Promise<void>
}
