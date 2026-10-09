import type { z } from "zod"
import type {
  executionKind,
  reviewContextSchema,
  workspaceStatusSchema,
} from "../chat-context-schema.js"

export type ExecutionKind = z.infer<typeof executionKind>
export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>
export type ReviewContext = z.infer<typeof reviewContextSchema>
export type ObservedBinding = NonNullable<WorkspaceStatus["observedBinding"]>
export type EvidenceFreshness = ReviewContext["freshness"]
export type ChatExecutionSummary = WorkspaceStatus["executions"]["recent"][number]
export type ApprovalPreview = NonNullable<NonNullable<ReviewContext["approval"]>["preview"]>
