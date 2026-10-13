import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { evaluateCandidate, parseEvaluationTap } from "./evaluate.ts"

test("실제 assertion 실패만 정확도로 계산하고 수집 오류는 구분한다", () => {
  const summary = "# tests 2\n# pass 1\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n"
  assert.equal(
    parseEvaluationTap(`not ok 1 - case\n  code: 'ERR_ASSERTION'\n${summary}`, 1).accuracy,
    0.5,
  )
  assert.equal(
    parseEvaluationTap(`not ok 1 - case\n  code: 'ERR_MODULE_NOT_FOUND'\n${summary}`, 1).accuracy,
    null,
  )
  assert.equal(
    parseEvaluationTap("# tests 0\n# pass 0\n# fail 0\n", 0).status,
    "infrastructure_error",
  )
})

test("API 기준 구현의 실제 실패를 평가하고 증거 덮어쓰기를 거부한다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pilot-evaluation-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = {
    checkout: resolve("tools/pilot/fixture"),
    taskId: "api" as const,
    evidenceDirectory: join(root, "evidence"),
  }
  const result = await evaluateCandidate(options)
  assert.equal(result.status, "failed")
  assert.equal(result.tests, 12)
  assert.ok(result.failed !== null && result.failed > 0)
  assert.match(await readFile(join(options.evidenceDirectory, "stdout.tap"), "utf8"), /not ok/)
  await assert.rejects(evaluateCandidate(options), { code: "EEXIST" })
})

test("없는 체크아웃과 시간 초과는 정확도 0으로 기록하지 않는다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pilot-evaluation-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "empty"))
  const missing = await evaluateCandidate({
    checkout: join(root, "empty"),
    taskId: "api",
    evidenceDirectory: join(root, "missing"),
  })
  assert.equal(missing.status, "infrastructure_error")
  assert.equal(missing.accuracy, null)
  const timed = await evaluateCandidate({
    checkout: resolve("tools/pilot/fixture"),
    taskId: "retry",
    evidenceDirectory: join(root, "timeout"),
    timeoutMs: 1,
  })
  assert.equal(timed.status, "infrastructure_error")
  assert.match(timed.infrastructureError ?? "", /timed out/)
})

test("고정된 외부 평가 파일을 사용하고 모든 통과 결과를 기록한다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pilot-evaluation-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const evaluationRoot = join(root, "private")
  await mkdir(evaluationRoot)
  await writeFile(
    join(evaluationRoot, "api.acceptance.ts"),
    'import { test } from "node:test"; import assert from "node:assert/strict"; test("고정 평가", () => assert.equal(1, 1))',
  )
  const result = await evaluateCandidate({
    checkout: root,
    taskId: "api",
    evaluationRoot,
    evidenceDirectory: join(root, "evidence"),
  })
  assert.equal(result.status, "passed")
  assert.equal(result.accuracy, 1)
  assert.equal(result.tests, 1)
})
