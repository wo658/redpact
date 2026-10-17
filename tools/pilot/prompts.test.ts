import assert from "node:assert/strict"
import { test } from "node:test"
import { makeTaskPrompt } from "./prompts.ts"

const task = {
  id: "api",
  title: "HTTP 주문 수량 입력 검증",
  files: ["src/checkout-request.ts"],
  acceptance: ["빈 본문은 수량 1로 처리한다."],
}
const common = {
  task,
  checkout: "/project/subjects/api-a",
  redpactOrigin: "http://127.0.0.1:54322",
  timeoutSeconds: 900,
}

test("모든 조건에 동일한 공개 과제와 제한시간을 제공한다", () => {
  for (const condition of ["A", "B", "C"] as const) {
    const prompt = makeTaskPrompt({ ...common, condition, verificationGuide: "승인된 실행 가이드" })
    assert.ok(prompt.includes(task.title))
    assert.ok(prompt.includes(task.acceptance[0]))
    assert.ok(prompt.includes(task.files[0]))
    assert.ok(prompt.includes(common.checkout))
    assert.match(prompt, /900초/)
    assert.match(prompt, /새 컨텍스트/)
    assert.match(prompt, /서브에이전트.*생성하지/)
    assert.match(prompt, /숨겨진 평가/)
    assert.match(prompt, /실제 assertion 실패/)
    assert.match(prompt, /샌드박스.*아닙니다/)
  }
})
test("A는 Redpact 없이 자신의 Compose 환경을 실행하고 정리한다", () => {
  const prompt = makeTaskPrompt({ ...common, condition: "A" })
  assert.match(prompt, /docker compose/)
  assert.match(prompt, /Redpact.*사용하지/)
  assert.match(prompt, /자신의.*정리/)
})
test("B는 전달된 HTTP 실행 가이드를 보존하고 MCP 및 승인 우회를 금지한다", () => {
  const guide = "API 계약은 실행 시 제공한 OpenAPI를 따르세요."
  const prompt = makeTaskPrompt({ ...common, condition: "B", verificationGuide: guide })
  assert.ok(prompt.includes(guide))
  assert.ok(prompt.includes(common.redpactOrigin))
  assert.match(prompt, /MCP.*사용하지/)
  assert.match(prompt, /승인.*엔드포인트.*호출하지/)
})
test("C는 MCP 실행 경로가 없을 때 HTTP로 대체하지 않는다", () => {
  const prompt = makeTaskPrompt({ ...common, condition: "C" })
  assert.match(prompt, /MCP/)
  assert.match(prompt, /HTTP.*대체하지/)
  assert.match(prompt, /차단/)
})
test("UI의 평가 가능한 공개 접근성 및 DOM 계약을 미리 알린다", () => {
  const prompt = makeTaskPrompt({ ...common, task: { ...task, id: "ui" }, condition: "A" })
  for (const value of [
    "Apply",
    "Reset",
    "Retry",
    "#orders",
    "1440×900",
    "390×844",
    'role="status"',
  ]) {
    assert.ok(prompt.includes(value), value)
  }
})
test("제한시간이 잘못되면 실험 지시를 생성하지 않는다", () => {
  for (const timeoutSeconds of [0, -1, NaN, 1.5]) {
    assert.throws(
      () => makeTaskPrompt({ ...common, condition: "A", timeoutSeconds }),
      /timeoutSeconds/,
    )
  }
})

test("관리형 functional 대상에 포함되는 과제 파일명을 모든 조건에 알린다", () => {
  for (const condition of ["A", "B", "C"] as const) {
    const prompt = makeTaskPrompt({ ...common, task: { ...task, id: "ui" }, condition })
    assert.ok(prompt.includes("ui-tests/worktree/task.spec.ts"))
  }
})
