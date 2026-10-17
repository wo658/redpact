import { reviewPath } from "../../core/chat-context.js"
import type { ExecutionReviewView } from "../../core/types/execution-reviews.js"
import type { ReviewView } from "../../core/types/reviews.js"
import { output } from "./result.js"

export function reviewResult({ review, submission, run }: ReviewView) {
  const value = run ?? {
    id: review.id,
    state: review.state === "pending" ? "awaiting_approval" : review.state,
    submissionId: submission.id,
    error: review.error,
  }
  return output({
    ...value,
    reviewId: review.id,
    approval: review.policy,
    reviewPath: reviewPath("integration", review.id),
  })
}

export function executionReviewResult({ review, run }: ExecutionReviewView) {
  return output({
    kind: review.kind,
    id: run?.id ?? review.id,
    state: run?.state ?? (review.state === "pending" ? "awaiting_approval" : review.state),
    reviewId: review.id,
    approval: review.policy,
    review,
    ...(run ? { run } : {}),
    reviewPath: reviewPath(review.kind, review.id, review),
  })
}
