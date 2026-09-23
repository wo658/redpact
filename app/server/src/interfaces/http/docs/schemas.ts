import { z } from "zod"
import { environmentPlanSchema } from "../../../core/environment-plan-schema.js"
import { environmentSchema } from "../../../core/environment-schema.js"
import {
  dependencyDefinition,
  settingsShape,
  testSelectionSchema,
} from "../../../core/settings-schema.js"
import { startWorkInput } from "../../../core/start-work-schema.js"
import { stepResultSchema } from "../../../core/step-schema.js"
import { trackingSchema } from "../../../core/tracking-schema.js"
import type {
  ProjectRecord,
  Run,
  Submission,
  WorkItem,
  Worktree,
} from "../../../core/types/contracts.js"
import type { GitSnapshot } from "../../../core/types/git.js"
import type { WorkStart } from "../../../core/types/start-work.js"

const id = z.string().uuid()
const strings = z.array(z.string())
export const healthResponse = z.object({
  status: z.literal("ok"),
  git: z.enum(["connected", "not_connected"]),
})
export const projectResponse: z.ZodType<ProjectRecord> = z
  .object({
    disconnectedAt: z.string().optional(),
    tracking: trackingSchema.optional(),
    id,
    name: z.string(),
    createdAt: z.string(),
    location: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("git"), commonGitdir: z.string(), projectPath: z.string() }),
      z.object({ kind: z.literal("directory"), root: z.string() }),
    ]),
  })
  .meta({ id: "Project" })
export const worktreeResponse: z.ZodType<Worktree> = z
  .object({
    id,
    projectId: id,
    branch: z.string().nullable().optional(),
    checkoutRoot: z.string(),
    projectRoot: z.string(),
    gitdir: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "Worktree" })
export const workResponse: z.ZodType<WorkItem> = z
  .object({
    id,
    intent: z.string(),
    createdAt: z.string(),
    projectId: id.optional(),
    worktreeId: id.optional(),
  })
  .meta({ id: "WorkItem" })
export const submissionResponse: z.ZodType<Submission> = z
  .object({
    id,
    workItemId: id,
    projectId: id.optional(),
    worktreeId: id.optional(),
    projectRoot: z.string().optional(),
    files: z.array(z.object({ path: z.string(), source: z.string() })),
    digest: z.string(),
    runnerVersion: z.string(),
    createdAt: z.string(),
    parsed: z.array(
      z.object({
        path: z.string(),
        review: z.object({
          limitations: strings,
          scenarios: z.array(
            z.object({
              title: z.string(),
              intent: z.string().nullable(),
              line: z.number(),
              assertions: z.array(
                z.object({
                  code: z.string(),
                  reason: z.string().nullable(),
                  line: z.number(),
                  observed: z.literal("unknown"),
                }),
              ),
            }),
          ),
        }),
      }),
    ),
  })
  .meta({ id: "Submission" })
export const gitResponse: z.ZodType<GitSnapshot> = z
  .discriminatedUnion("available", [
    z.object({ available: z.literal(false), reason: z.string() }),
    z.object({
      available: z.literal(true),
      root: z.string(),
      gitdir: z.string(),
      commonGitdir: z.string(),
      branch: z.string().nullable().optional(),
      revision: z.string().nullable(),
      dirty: z.boolean(),
      changes: z.array(
        z.object({ path: z.string(), head: z.number(), worktree: z.number(), stage: z.number() }),
      ),
    }),
  ])
  .meta({ id: "GitSnapshot" })
export const environmentResponse = environmentSchema.meta({ id: "Environment" })
const environmentSummary = z.object({
  id: environmentSchema.shape.id,
  state: environmentSchema.shape.state,
  endpoints: environmentSchema.shape.endpoints,
  errors: environmentSchema.shape.errors,
})
export const runResponse: z.ZodType<Run & { environment?: z.infer<typeof environmentSummary> }> = z
  .object({
    id,
    submissionId: id,
    state: z.enum(["queued", "running", "finished"]),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    limitations: strings,
    result: z
      .object({
        outcome: z.enum([
          "passed",
          "assertion_failed",
          "collection_error",
          "environment_error",
          "execution_error",
          "configuration_error",
          "cancelled",
          "interrupted",
          "unknown",
        ]),
        cases: z.array(
          z.object({
            steps: z.array(stepResultSchema).max(200).optional(),
            name: z.string(),
            file: z.string(),
            state: z.string(),
            errors: z.array(
              z.object({ name: z.string(), message: z.string(), stack: z.string().optional() }),
            ),
          }),
        ),
        errors: strings,
      })
      .nullable(),
    environmentId: id.optional(),
    environmentPolicy: z
      .object({ source: z.literal("new"), retain: z.literal("never") })
      .optional(),
    target: z
      .object({ projectId: id, worktreeId: id, projectRoot: z.string(), checkoutRoot: z.string() })
      .optional(),
    git: gitResponse.optional(),
    settings: z.object({ file: z.string(), source: z.string(), digest: z.string() }).optional(),
    environment: environmentSummary.optional(),
  })
  .meta({ id: "Run" })
export const workStartResponse: z.ZodType<WorkStart> = z
  .object({
    id,
    input: startWorkInput,
    checkoutRoot: z.string(),
    revision: z.string(),
    worktreeId: id,
    workItemId: id,
    createdAt: z.string(),
    state: z.enum(["prepared", "attempted", "created", "completed"]),
  })
  .meta({ id: "WorkStart" })
export const startedWorkResponse = z
  .object({
    requestId: id,
    workItemId: id,
    worktreeId: id,
    projectId: id,
    checkoutRoot: z.string(),
    projectRoot: z.string(),
    revision: z.string(),
    configure: z.object({
      tool: z.literal("configure"),
      arguments: z.object({ action: z.literal("describe"), worktreeId: id }),
    }),
    nextSteps: strings,
  })
  .meta({ id: "StartedWork" })
const settingsIssue = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  file: z.string().optional(),
  get related(): z.ZodOptional<z.ZodArray<typeof settingsIssue>> {
    return z.array(settingsIssue).optional()
  },
})
export const settingsResponse = z
  .object({
    valid: z.boolean(),
    file: z.string(),
    issues: z.array(settingsIssue),
    digest: z.string().optional(),
    bundle: z
      .object({ files: z.array(z.object({ path: z.string(), sha256: z.string() })) })
      .optional(),
    plans: z.record(z.string(), environmentPlanSchema).optional(),
  })
  .meta({ id: "SettingsValidation" })
export const worktreeSettingsResponse = settingsResponse
  .extend({ worktreeId: id, projectId: id })
  .meta({ id: "WorktreeSettingsValidation" })
const jsonSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "JSON Schema describing the settings format; returned by the shared settings definition.",
  )
export const settingsSpecificationResponse = z
  .object({
    path: z.literal(".redpact/settings.json"),
    format: z.literal("json"),
    schema: jsonSchema,
    example: z.string(),
    workflow: strings,
    limits: strings,
  })
  .meta({ id: "SettingsSpecification" })

export const dependenciesResponse = z
  .object({
    valid: z.boolean(),
    file: z.string(),
    issues: z.array(settingsIssue),
    digest: z.string().optional(),
    bundle: z
      .object({ files: z.array(z.object({ path: z.string(), sha256: z.string() })) })
      .optional(),
    services: strings.optional(),
    dependencies: z.record(z.string(), dependencyDefinition).optional(),
    applicationServices: settingsShape.shape.applicationServices,
    relationships: settingsShape.shape.relationships,
    selection: testSelectionSchema.optional(),
    plan: environmentPlanSchema.optional(),
    worktreeId: id.optional(),
    projectId: id,
  })
  .meta({ id: "DependencySettings" })
