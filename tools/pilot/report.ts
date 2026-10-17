import type { Evaluation } from "./evaluate.ts"

export interface ReportRow {
  condition: "A" | "B" | "C"
  taskId: string
  repetition: number
  measurement: {
    summary: {
      status: string
      elapsedMs: number | null
      usage: {
        inputTokens: number | null
        cachedInputTokens: number | null
        outputTokens: number | null
        totalTokens: number | null
      }
    }
  }
  evaluation: Evaluation
}

function sum(values: (number | null)[]): number | null {
  if (
    values.length === 0 ||
    values.some((value) => value === null || !Number.isFinite(value) || value < 0)
  ) {
    return null
  }
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}
function median(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Quality describes frozen submitted code; transport compliance is audited separately.
export function aggregateConditions(rows: ReportRow[]) {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = JSON.stringify([row.condition, row.taskId, row.repetition])
    if (seen.has(key)) {
      throw new Error(`Duplicate trial: ${key}`)
    }
    seen.add(key)
  }
  return (["A", "B", "C"] as const).flatMap((condition) => {
    const trials = rows.filter((row) => row.condition === condition)
    if (trials.length === 0) {
      return []
    }
    const evaluated = trials.filter((row) => row.evaluation.status !== "infrastructure_error")
    const successfulTasks = evaluated.filter((row) => row.evaluation.status === "passed").length
    const totalTokens = sum(trials.map((row) => row.measurement.summary.usage.totalTokens))
    const elapsed = trials.map((row) => row.measurement.summary.elapsedMs)
    const observed = elapsed.filter(
      (value): value is number => value !== null && Number.isFinite(value) && value >= 0,
    )
    const tests = sum(evaluated.map((row) => row.evaluation.tests))
    const passed = sum(evaluated.map((row) => row.evaluation.passed))
    const qualityComplete = evaluated.length === trials.length
    return [
      {
        condition,
        runs: trials.length,
        evaluatedTasks: evaluated.length,
        successfulTasks,
        failedTasks: evaluated.length - successfulTasks,
        infrastructureErrors: trials.length - evaluated.length,
        executionFailures: trials.filter((row) => row.measurement.summary.status !== "completed")
          .length,
        taskSuccessRate: qualityComplete ? successfulTasks / trials.length : null,
        observedTaskSuccessRate: evaluated.length > 0 ? successfulTasks / evaluated.length : null,
        observedTests: tests,
        observedPassedTests: passed,
        testPassRate:
          qualityComplete && tests !== null && tests > 0 && passed !== null ? passed / tests : null,
        inputTokens: sum(trials.map((row) => row.measurement.summary.usage.inputTokens)),
        cachedInputTokens: sum(
          trials.map((row) => row.measurement.summary.usage.cachedInputTokens),
        ),
        outputTokens: sum(trials.map((row) => row.measurement.summary.usage.outputTokens)),
        totalTokens,
        tokensPerSuccessfulTask:
          totalTokens !== null && qualityComplete && successfulTasks > 0
            ? totalTokens / successfulTasks
            : null,
        elapsedMs: {
          sum: sum(elapsed),
          median: observed.length === trials.length ? median(observed) : null,
          observedCount: observed.length,
          observedSum: sum(observed),
          observedMedian: median(observed),
        },
      },
    ]
  })
}
