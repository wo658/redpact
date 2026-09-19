import { createHash } from "node:crypto"
import { z } from "zod"
import { environmentPlanSchema } from "./environment-plan-schema.js"
import { executionSettingsSchema } from "./execution-settings.js"
import { settingsSchema, testSelectionSchema } from "./settings-schema.js"

export const environmentSchema = z
  .strictObject({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    ownerId: z.string().uuid(),
    target: z.strictObject({
      projectId: z.string(),
      worktreeId: z.string(),
      projectRoot: z.string(),
      checkoutRoot: z.string(),
    }),
    projectName: z.string().regex(/^redpact-[a-f0-9-]+$/),
    settings: executionSettingsSchema,
    specification: settingsSchema,
    selection: testSelectionSchema,
    plan: environmentPlanSchema,
    bundle: z.array(z.strictObject({ path: z.string(), sha256: z.string() })),
    projectRules: z
      .strictObject({
        file: z.string(),
        source: z.string().max(262144),
        override: z.strictObject({ file: z.string(), source: z.string().max(262144) }).optional(),
      })
      .optional(),
    settingsDigest: z.string(),
    inputDigest: z.string(),
    state: z.enum([
      "preparing",
      "ready",
      "in_use",
      "completed",
      "failed",
      "unavailable",
      "stopping",
      "stop_failed",
      "stopped",
    ]),
    runtimeId: z.string().optional(),
    runId: z.string().optional(),
    lifecycle: z.enum(["run", "manual"]),
    runIds: z.array(z.string().uuid()),
    resources: z.array(
      z.strictObject({
        kind: z.enum(["container", "network", "volume"]),
        id: z.string(),
        image: z.string().optional(),
        service: z.string().optional(),
        status: z.string().optional(),
      }),
    ),
    endpoints: z.record(z.string(), z.strictObject({ host: z.string(), port: z.number().int() })),
    services: z.array(z.strictObject({ name: z.string(), job: z.boolean() })),
    errors: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((value, context) => {
    if (value.lifecycle === "manual" && (value.runIds.length > 0 || value.runId)) {
      context.addIssue({ code: "custom", message: "Manual environments cannot own test runs" })
    }
    const files = [...value.bundle].sort((a, b) => {
      if (a.path < b.path) {
        return -1
      }
      if (a.path > b.path) {
        return 1
      }
      return 0
    })
    const digest = createHash("sha256")
      .update(JSON.stringify(files.map((f) => [f.path, f.sha256])))
      .digest("hex")
    if (digest !== value.settingsDigest) {
      context.addIssue({ code: "custom", message: "Bundle identity mismatch" })
    }
  })
