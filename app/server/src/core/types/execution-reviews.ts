import type { z } from "zod"
import type { executionReviewRecordSchema } from "../execution-review-schema.js"
import type { CaptureRun } from "./playwright.js"
import type { UnitRun } from "./unit-tests.js"

export type ExecutionReviewRecord = z.infer<typeof executionReviewRecordSchema>
export type ExecutionReviewView = {
  review: Omit<ExecutionReviewRecord, "token">
  run?: UnitRun | CaptureRun
}
export type ExecutionReviewInput = {
  kind: "unit" | "playwright"
  path: string
  target?: string
  viewport?: { width: number; height: number }
}
export type ExecutionReviewStore = {
  list(): ExecutionReviewRecord[]
  save(record: ExecutionReviewRecord): void
}
export type ExecutionReviews = {
  request(input: ExecutionReviewInput): Promise<ExecutionReviewView>
  get(id: string): ExecutionReviewView | undefined
  list(): ExecutionReviewView[]
  approve(input: { id: string; token: string; revision: number }): Promise<ExecutionReviewView>
  cancel(id: string): Promise<ExecutionReviewView | undefined>
  capability(id: string): string
  close(): Promise<void>
}
