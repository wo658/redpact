import { z } from "zod"

const selection = z.object({
  services: z.array(z.string()),
  select: z.record(z.string(), z.string()),
})
const policy = z.enum(["auto", "ask"])
const review = z.object({
  id: z.string(),
  revision: z.number(),
  path: z.string(),
  policy,
  state: z.string(),
  environmentApproved: z.boolean(),
  testsApproved: z.boolean(),
  selection,
  dependencies: z.record(z.string(), z.array(z.string())),
  error: z.string().optional(),
})
const submission = z.object({
  digest: z.string(),
  files: z.array(z.object({ path: z.string(), source: z.string() })),
  parsed: z.array(
    z.object({
      path: z.string(),
      review: z.object({
        scenarios: z.array(
          z.object({
            title: z.string(),
            intent: z.string().nullable(),
            assertions: z.array(z.object({ code: z.string(), reason: z.string().nullable() })),
          }),
        ),
      }),
    }),
  ),
})
export const snapshotSchema = z.object({
  kind: z.enum(["environment", "review", "tests", "inputs"]),
  inputs: z.array(z.object({ name: z.string(), configured: z.boolean() })).optional(),
  projectId: z.string().optional(),
  policy: policy.optional(),
  nextPolicy: policy.optional(),
  token: z.string().optional(),
  review: review.optional(),
  submission: submission.optional(),
  path: z.string().optional(),
  selection: selection.optional(),
  dependencies: z.record(z.string(), z.array(z.string())).optional(),
  valid: z.boolean().optional(),
  issues: z.array(z.object({ message: z.string() })).optional(),
  run: z
    .object({
      id: z.string(),
      state: z.string(),
      result: z
        .object({
          outcome: z.string(),
          errors: z.array(z.string()),
          cases: z.array(
            z.object({
              name: z.string(),
              file: z.string(),
              state: z.string(),
              errors: z.array(z.object({ message: z.string() })),
            }),
          ),
        })
        .nullable(),
      environment: z.object({ state: z.string() }).optional(),
    })
    .optional(),
})
export type Snapshot = z.infer<typeof snapshotSchema>
export type Policy = z.infer<typeof policy>
export type Selection = z.infer<typeof selection>
export type CardActions = {
  busy: boolean
  approve(subject: "environment" | "tests", selection?: Selection): void
  changePolicy(policy: Policy): void
}

export function keyedRows<T>(values: T[], name: (value: T) => string) {
  const counts = new Map<string, number>()
  return values.map((value) => {
    const label = name(value)
    const occurrence = counts.get(label) ?? 0
    counts.set(label, occurrence + 1)
    return { value, key: `${label}:${occurrence}` }
  })
}

export type SecretStatus = { name: string; configured: boolean }
