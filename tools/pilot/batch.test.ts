import assert from "node:assert/strict"
import { test } from "node:test"
import { planBatches } from "./batch.ts"

test("세 조건의 두 반복을 재현 가능한 순서로 배치한다", () => {
  const plan = planBatches(["A", "B", "C"], 2, 17)
  assert.equal(plan.length, 6)
  assert.deepEqual(plan, planBatches(["A", "B", "C"], 2, 17))
  for (const condition of ["A", "B", "C"]) {
    assert.equal(plan.filter((row) => row.condition === condition).length, 2)
  }
})

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareBatch, runBatch } from "./batch.ts"
import { evaluateCandidate } from "./evaluate.ts"
import { summarizeRun } from "./metrics.ts"

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "pilot-batch-"))
  const manifest = await prepareBatch({
    root: join(parent, "experiment"),
    model: "fixture",
    reasoningEffort: "medium",
    conditions: ["A"],
    repetitions: 1,
    seed: 17,
    timeoutMs: 1000,
    evaluationTimeoutMs: 1000,
    playwrightModule: "/fixture/playwright.mjs",
  })
  return { parent, manifest }
}
test("독립 워크트리 세 개를 병렬 실행하고 예외 비용도 보존한다", async () => {
  const { parent, manifest } = await fixture()
  try {
    assert.equal(new Set(manifest.batches[0].subjects.map((s) => s.checkout)).size, 3)
    let active = 0
    let peak = 0
    let completed = 0
    const report = await runBatch(manifest, {
      setup: async () => {},
      measure: async (config) => {
        active++
        peak = Math.max(active, peak)
        await new Promise((resolve) => setTimeout(resolve, 30))
        active--
        completed++
        if (config.cwd.endsWith("api")) {
          throw new Error("simulated spawn failure")
        }
        const metadata = {
          elapsedMs: 30,
          exitCode: 0,
          infrastructureError: null,
          timedOut: false,
          signal: null,
          resourceCleanupVerified: false,
          approvalMode: "sandbox_only" as const,
          condition: config.condition,
          model: "fixture",
          reasoningEffort: "medium",
        }
        return {
          metadata,
          summary: summarizeRun(
            JSON.stringify({ type: "thread.started", thread_id: config.cwd }) +
              "\n" +
              JSON.stringify({
                type: "turn.completed",
                usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 },
              }),
            metadata,
          ),
        }
      },
      evaluate: async (options) => ({
        status: "passed" as const,
        tests: 1,
        passed: 1,
        failed: 0,
        accuracy: 1,
        infrastructureError: null,
        elapsedMs: 1,
        exitCode: 0,
        evidenceDirectory: options.evidenceDirectory,
      }),
    })
    assert.equal(peak, 3)
    assert.equal(completed, 3)
    assert.equal(report.rows.length, 3)
    assert.equal(report.conditions[0].infrastructureErrors, 1)
    assert.equal(report.conditions[0].totalTokens, null)
    assert.equal(report.conditions[0].taskSuccessRate, null)
    assert.equal(
      JSON.parse(await readFile(join(manifest.config.root, "report.json"), "utf8")).rows.length,
      3,
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
test("런타임 준비가 실패하면 피실험자를 시작하지 않는다", async () => {
  const { parent, manifest } = await fixture()
  let launched = false
  try {
    await assert.rejects(
      runBatch(manifest, {
        setup: async () => {
          throw new Error("runtime blocked")
        },
        measure: async () => {
          launched = true
          throw new Error("unexpected")
        },
        evaluate: evaluateCandidate,
      }),
      /runtime blocked/,
    )
    assert.equal(launched, false)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
test("변경된 초기 코드와 평가 파일을 실행 전에 거부한다", async () => {
  const { parent, manifest } = await fixture()
  try {
    await writeFile(join(manifest.batches[0].subjects[0].checkout, "src/payment.ts"), "changed")
    await assert.rejects(runBatch(manifest), /start clean/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test("준비 이후 프롬프트나 평가기가 달라지면 피실험자를 시작하지 않는다", async () => {
  for (const target of ["prompt", "evaluator"]) {
    const { parent, manifest } = await fixture()
    try {
      const path =
        target === "prompt"
          ? manifest.batches[0].subjects[0].promptFile
          : join(manifest.config.root, "private/evaluation/api.acceptance.ts")
      await writeFile(path, "changed")
      await assert.rejects(
        runBatch(manifest),
        target === "prompt" ? /Prompt changed/ : /Evaluator changed/,
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }
})
