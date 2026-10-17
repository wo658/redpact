import assert from "node:assert/strict"

// Only interaction waits become functional failures; startup and transport errors remain infrastructure errors.
export async function expectUiBehavior(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      assert.fail(`UI behavior did not satisfy the acceptance expectation: ${error.message}`)
    }
    throw error
  }
}
