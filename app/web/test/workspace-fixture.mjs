export const project = {
  id: "example-project",
  name: "Redpact example",
  location: { kind: "git", commonGitdir: "/example/redpact/.git", projectPath: "." },
  createdAt: "2026-09-10T00:00:00Z",
}
const worktree = {
  id: "example-worktree",
  projectId: project.id,
  projectRoot: "/example/redpact",
  checkoutRoot: "/example/redpact",
  branch: "feature/components",
  createdAt: project.createdAt,
}
export function sampleApi() {
  return {
    projects: async () => [project],
    worktrees: async () => [worktree],
    getTracking: async () => ({
      projectRoot: worktree.projectRoot,
      tracking: { mainBranch: "local", hideMerged: true },
    }),
    getBranches: async () => ["local", "feature/components"],
    branchReviews: async () => [],
    gitDiff: async () => ({ available: true, patch: "", omitted: [] }),
    mergeInspection: async () => ({
      source: { ...worktree, branch: worktree.branch, dirty: false, unmerged: false, files: [] },
      target: null,
      records: [],
      blockedReason: "No merge target",
    }),
    approvalPolicy: async () => ({ policy: "auto" }),
    projectConfiguration: async () => ({
      file: ".redpact/settings.json",
      source: "{}",
      revision: "1",
      issues: [],
    }),
    instanceSettings: async () => ({
      file: "settings.json",
      source: "{}",
      revision: "1",
      issues: [],
    }),
    environments: async () => [],
    worktreeDependencies: async () => ({ valid: true, services: [], dependencies: {}, issues: [] }),
    worktreeSelection: async () => ({ selection: null }),
    executionLogs: async () => ({ items: [], nextCursor: null }),
  }
}
