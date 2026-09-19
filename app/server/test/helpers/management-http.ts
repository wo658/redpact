import type { createApp } from "../../src/app.js"

// Administrative operations remain HTTP APIs after their removal from MCP.
export async function managementHttp(
  app: ReturnType<typeof createApp>,
  name: string,
  input: object,
) {
  const args = input as Record<string, unknown>
  const operations: Record<string, { path: string; body?: object }> = {
    cancel_run: { path: `/api/runs/${args.id}/cancel`, body: {} },
    stop_environment: { path: `/api/environments/${args.id}/stop`, body: {} },
    connect_project: { path: "/api/projects", body: args },
    attach_worktree: {
      path: `/api/projects/${args.projectId}/worktrees`,
      body: { path: args.path },
    },
    get_worktree: { path: `/api/worktrees/${args.id}` },
    start_work: { path: "/api/work-starts", body: args },
    get_work_start: { path: `/api/work-starts/${args.id}` },
    list_environments: { path: `/api/environments?worktreeId=${args.worktreeId}` },
    get_dependencies: { path: `/api/worktrees/${args.worktreeId}/dependencies` },
    run_tests: { path: "/api/runs", body: args },
  }
  const operation = operations[name]
  if (!operation) {
    throw new Error(`No HTTP operation: ${name}`)
  }
  const response = await app.request(operation.path, {
    headers: { Host: "localhost", "Content-Type": "application/json" },
    ...(operation.body ? { method: "POST", body: JSON.stringify(operation.body) } : {}),
  })
  return { isError: !response.ok, structuredContent: await response.json() }
}
