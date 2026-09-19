import type { CaseResult, RunResult } from "./types/contracts.js"
export function classifyReport(
  report: { cases: CaseResult[]; collectionErrors: string[]; errors: string[] },
  exitCode: number,
): RunResult {
  if (report.collectionErrors.length) {
    return { outcome: "collection_error", cases: report.cases, errors: report.collectionErrors }
  }
  if (report.errors.length) {
    return { outcome: "execution_error", cases: report.cases, errors: report.errors }
  }
  const failed = report.cases.filter((item) => item.state === "failed")
  if (failed.length) {
    const assertionsOnly = failed.every(
      (item) =>
        item.errors.length > 0 && item.errors.every((error) => error.name === "AssertionError"),
    )
    return {
      outcome: assertionsOnly ? "assertion_failed" : "execution_error",
      cases: report.cases,
      errors: [],
    }
  }
  const allPassed = report.cases.length > 0 && report.cases.every((item) => item.state === "passed")
  return {
    outcome: exitCode === 0 && allPassed ? "passed" : "unknown",
    cases: report.cases,
    errors: [],
  }
}
