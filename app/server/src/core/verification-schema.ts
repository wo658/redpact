import { isAbsolute } from "node:path"
import { z } from "zod"
import { captureInputSchema } from "./playwright-schema.js"
import { name, projectPath } from "./settings-schema.js"

export const verificationPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(isAbsolute, "Use an absolute checkout path")
export const executionKind = z.enum(["integration", "unit", "playwright"])
export const executionIdentity = z.strictObject({ kind: executionKind, id: z.string().uuid() })
export const unitExecutionInput = z.strictObject({ path: verificationPath })
export const playwrightExecutionInput = captureInputSchema.extend({
  path: verificationPath,
  target: name,
})
export const executionReadInput = executionIdentity
  .extend({
    detail: z.enum(["result", "log", "source", "image"]).default("result"),
    sourcePath: projectPath.optional(),
    artifactId: z.string().uuid().optional(),
    side: z.enum(["before", "after"]).default("after"),
  })
  .superRefine((input, context) => {
    if ((input.detail === "source") !== Boolean(input.sourcePath)) {
      context.addIssue({ code: "custom", message: "sourcePath is required only for source detail" })
    }
    if ((input.detail === "image") !== Boolean(input.artifactId)) {
      context.addIssue({ code: "custom", message: "artifactId is required only for image detail" })
    }
    if (input.detail === "image" && input.kind !== "playwright") {
      context.addIssue({ code: "custom", message: "Images belong to Playwright executions" })
    }
    if (input.detail === "source" && input.kind === "unit") {
      context.addIssue({
        code: "custom",
        message: "Unit executions record whole-command output; use result or log",
      })
    }
  })
