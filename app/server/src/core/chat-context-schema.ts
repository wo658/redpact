import { z } from "zod"

export const executionKind = z.enum(["integration", "unit", "playwright"])
const freshness = z.strictObject({ state: z.literal("unknown"), reason: z.string() })
const summary = z.strictObject({
  id: z.string(),
  kind: executionKind,
  intent: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  reviewPath: z.string(),
})
const pending = z.strictObject({
  id: z.string(),
  kind: executionKind,
  state: z.string(),
  createdAt: z.string(),
  reviewPath: z.string(),
})
export const workspaceStatusSchema = z.strictObject({
  path: z.string(),
  projectRoot: z.string(),
  rulesRoot: z.string(),
  observedBinding: z
    .strictObject({
      projectId: z.string(),
      worktreeId: z.string(),
      checkoutRoot: z.string(),
      disconnected: z.boolean(),
    })
    .nullable(),
  settings: z.strictObject({
    valid: z.boolean(),
    file: z.string(),
    digest: z.string().optional(),
    issueCount: z.number(),
    issues: z
      .array(
        z.strictObject({
          code: z.string(),
          path: z.string(),
          message: z.string(),
          file: z.string().optional(),
          line: z.number().optional(),
          column: z.number().optional(),
        }),
      )
      .max(20),
  }),
  readiness: z.literal("not_checked"),
  approval: z.strictObject({
    policy: z.enum(["ask", "auto"]),
    pending: z.array(pending).max(20),
    pendingCount: z.number(),
  }),
  executions: z.strictObject({
    recent: z.array(summary).max(20),
    active: z.array(summary).max(20),
    cleanup: z.array(summary).max(20),
    nextCursor: z.string().nullable(),
    activeCount: z.number(),
    cleanupCount: z.number(),
  }),
  freshness,
  humanAcceptance: z.literal("not_recorded"),
})
const approvalPreview = z.strictObject({
  settingsDigest: z.string(),
  inputDigest: z.string().optional(),
  sourceDigest: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  dockerfile: z.string().optional(),
  target: z.string().optional(),
  purpose: z.string().optional(),
  viewport: z.strictObject({ width: z.number(), height: z.number() }).optional(),
  services: z.array(z.string()).max(50).optional(),
  serviceCount: z.number().optional(),
  dependencies: z
    .array(z.strictObject({ name: z.string(), kind: z.string() }))
    .max(50)
    .optional(),
  dependencyCount: z.number().optional(),
  tests: z
    .array(
      z.strictObject({
        path: z.string(),
        scenarios: z.array(z.string()).max(20),
        scenarioCount: z.number(),
      }),
    )
    .max(50)
    .optional(),
  testFileCount: z.number().optional(),
})
export const reviewContextSchema = z.strictObject({
  kind: executionKind,
  id: z.string(),
  intent: z.string(),
  executionId: z.string().nullable(),
  projectId: z.string().nullable(),
  worktreeId: z.string().nullable(),
  path: z.string().nullable(),
  state: z.string(),
  outcome: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  reviewPath: z.string(),
  approval: z
    .strictObject({
      state: z.string(),
      policy: z.enum(["auto", "ask"]),
      requestId: z.string(),
      revision: z.number(),
      environmentApproved: z.boolean().optional(),
      testsApproved: z.boolean().optional(),
      preview: approvalPreview.optional(),
    })
    .nullable(),
  cleanup: z.strictObject({ state: z.string(), issues: z.array(z.string()).max(20) }),
  failures: z
    .array(
      z.strictObject({
        scope: z.string(),
        classification: z.string(),
        message: z.string().max(2048),
        file: z.string().optional(),
        case: z.string().optional(),
      }),
    )
    .max(20),
  failureCount: z.number(),
  evidence: z
    .array(
      z.strictObject({
        type: z.enum(["log", "source", "image", "attachment"]),
        label: z.string(),
        tool: z.string().optional(),
        arguments: z.record(z.string(), z.unknown()).optional(),
        contentType: z.string().optional(),
        bytes: z.number().optional(),
      }),
    )
    .max(20),
  evidenceCount: z.number(),
  freshness,
  humanAcceptance: z.literal("not_recorded"),
})
