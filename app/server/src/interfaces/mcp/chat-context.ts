import type { McpServer } from "@modelcontextprotocol/server"
import { reviewContextInput, workspaceStatusInput } from "../../core/verification-schema.js"
import { getReviewContext, getWorkspaceStatus } from "../../workflows/chat-context.js"
import type { Services } from "../../workflows/services.js"
import { invoke, readOnly } from "./result.js"

export function registerChatContextTools(server: McpServer, services: Services) {
  server.registerTool(
    "get_workspace_status",
    {
      description:
        "Read the explicit absolute working checkout's shared settings diagnostics, existing observed binding, pending execution approvals, recent/active execution identities and cleanup attention. Does not register projects, create worktrees, write settings, run tests or grant approval. Freshness and human acceptance are separate from passing results. Use get_review_context for a specific execution.",
      inputSchema: workspaceStatusInput,
      annotations: readOnly,
    },
    ({ path }) => invoke(() => getWorkspaceStatus(services, path)),
  )
  server.registerTool(
    "get_review_context",
    {
      description:
        "Read a bounded review summary for an execution or pending approval request by kind and ID: recorded failure classification, cleanup, immutable evidence retrieval references and a relative viewer reviewPath scoped to this record. Open reviewPath against the connected Redpact viewer origin. Never changes results or records human acceptance; current-code freshness stays unknown until separately established. Detailed evidence remains available through get_execution.",
      inputSchema: reviewContextInput,
      annotations: readOnly,
    },
    (input) => invoke(() => getReviewContext(services, input)),
  )
}
