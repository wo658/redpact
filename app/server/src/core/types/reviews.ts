import type { z } from "zod"
import type { reviewRecordSchema } from "../review-schema.js"
import type { Submission } from "./contracts.js"
import type { RunQueries } from "./services.js"
import type { TestSelection } from "./settings.js"

export type ApprovalPolicy = "auto" | "ask"
export type ReviewRecord = z.infer<typeof reviewRecordSchema>
export type ReviewStore = {
  save(record: ReviewRecord): void
  list(): ReviewRecord[]
  policy(): ApprovalPolicy
  setPolicy(policy: ApprovalPolicy): void
}
export type ReviewInput = {
  path: string
  tests?: string[]
  selection?: TestSelection
}
export type ReviewView = {
  review: Omit<ReviewRecord, "token">
  submission: Submission
  run?: ReturnType<RunQueries["get"]>
}
export type ReviewTests = {
  start(input: ReviewInput): Promise<ReviewView>
  get(id: string): ReviewView | undefined
  approve(input: {
    id: string
    token: string
    revision: number
    subject: "environment" | "tests"
    selection?: TestSelection
  }): Promise<ReviewView>
  cancel(id: string): Promise<ReviewView | undefined>
  policy(): ApprovalPolicy
  changePolicy(token: string, policy: ApprovalPolicy): ApprovalPolicy
  capability(id?: string): string
  close(): Promise<void>
}
