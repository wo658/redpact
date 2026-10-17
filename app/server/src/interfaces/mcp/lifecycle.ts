import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { executionKind } from "../../core/verification-schema.js"
import { stopAgentRuntime } from "../../workflows/agent-verification.js"
import { getAgentRuntimeStatus, openAgentRuntime } from "../../workflows/runtime-agent.js"
import type { Services } from "../../workflows/services.js"
import { invoke, readOnly } from "./result.js"

export function registerLifecycleTools(server: McpServer, services: Services, origin: string) {
  server.registerTool(
    "redpact_status",
    {
      description:
        "Read Redpact runtime availability. Use the Redpact CLI for project, settings and verification operations.",
      inputSchema: z.strictObject({}),
      annotations: readOnly,
    },
    () => invoke(() => getAgentRuntimeStatus(services)),
  )
  server.registerTool(
    "stop_redpact_server",
    {
      description:
        "Request orderly shutdown of this Redpact runtime. This stops the connected server, not only a project environment.",
      inputSchema: z.strictObject({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () => invoke(() => stopAgentRuntime(services)),
  )
  server.registerTool(
    "open_redpact",
    {
      description:
        "Return the local Redpact viewer URL, optionally for an existing execution identified by kind and id. Does not run tests, open a browser or grant approval.",
      inputSchema: z.strictObject({
        kind: executionKind.optional(),
        id: z.string().uuid().optional(),
      }),
      annotations: readOnly,
    },
    (input) => invoke(() => openAgentRuntime(services, origin, input)),
  )
}
