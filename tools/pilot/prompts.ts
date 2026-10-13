export type PilotCondition = "A" | "B" | "C"

export interface PilotTask {
  id: string
  title: string
  files: string[]
  acceptance: string[]
}

export interface TaskPromptOptions {
  task: PilotTask
  condition: PilotCondition
  checkout: string
  redpactOrigin: string
  timeoutSeconds: number
  verificationGuide?: string
}

const conditionInstructions: Record<PilotCondition, string> = {
  A: `최종 검증은 자신의 docker compose 환경과 직접 실행한 테스트로 수행하세요.
Redpact HTTP API, MCP, Redpact CLI는 사용하지 마세요.
Compose 프로젝트 이름은 자신의 체크아웃에 고유하게 지정하고 동적 포트를 사용하세요.
자신의 환경에서만 상태를 확인하고 실행 후 자신의 컨테이너와 네트워크를 정리하세요. 다른 실험의 자원은 정리하지 마세요.`,
  B: `최종 검증은 터미널에서 Redpact HTTP API를 호출하여 요청하고 결과를 조회하세요.
Redpact MCP 도구는 사용하지 마세요. HTTP API를 CLI에서 호출하는 조건이며 별도 CLI 제품을 구현하는 과제가 아닙니다.
실행 API와 요청 스키마는 아래 제공된 검증 가이드 및 해당 런타임의 OpenAPI 계약으로 확인하세요. 없는 엔드포인트를 추측하지 마세요.
인간 승인용 엔드포인트를 직접 호출하지 마세요. 승인 대기라면 진행자에게 상태를 보고하고 기다리세요.`,
  C: `최종 검증은 연결된 Redpact MCP 도구로 요청하고 결과를 조회하세요.
Redpact HTTP API나 CLI로 대체하지 마세요. 직접 Compose 실행으로 관리형 검증을 대체하지 마세요.
MCP 도구 또는 실행 기능이 없거나 승인이 필요하면 차단 사유를 진행자에게 보고하세요. 승인 경계를 우회하지 마세요.`,
}

export function makeTaskPrompt(options: TaskPromptOptions): string {
  const { task, condition, checkout, redpactOrigin, timeoutSeconds, verificationGuide } = options
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("timeoutSeconds must be a positive safe integer")
  }
  if (!Object.hasOwn(conditionInstructions, condition)) {
    throw new Error("Unknown pilot condition")
  }
  const sections = [
    `당신은 개발 방식 비교 실험의 피실험 서브에이전트입니다. 새 컨텍스트에서 아래 한 과제만 독립적으로 수행하세요.
조건: ${condition}
작업 체크아웃: ${checkout}
제한시간: 시작부터 ${timeoutSeconds}초. 제한시간에는 도구 호출과 검증 대기가 포함됩니다.
이 지시는 프롬프트 수준의 실험 제한이며 보안 샌드박스가 아닙니다. 진행자가 실행 기록과 변경 파일을 사후 감사합니다.`,
    `과제: ${task.title} (${task.id})
수정 가능한 구현 파일: ${task.files.join(", ")}
인수 기준:\n${task.acceptance.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `모든 파일 읽기와 개발 작업은 위 체크아웃 안에서 수행하세요. 다른 worktree, 다른 Git 브랜치, 부모 저장소, 숨겨진 평가 테스트 및 참조 구현을 열거나 복사하지 마세요.
수정 범위는 지정된 구현 파일과 test/, tests/, task-tests/, integration/, ui-tests/ 아래 자신이 작성한 과제 테스트 및 증거입니다. 설정·의존성·Compose 정의·공개 기준 테스트는 변경하지 마세요.
Git 커밋·푸시·브랜치 변경을 하지 마세요. 다른 서브에이전트를 생성하지 마세요. 실험 진행자에게 필요한 차단 사유만 보고하세요.
권한 오류가 발생하면 제공된 도구의 승인 요청 기능으로 필요한 접근을 요청하세요. 자동 승인 검토가 거절하면 우회하지 말고 차단으로 보고하세요.
먼저 과제 테스트를 작성하고 실제 assertion 실패를 관찰한 다음 구현하세요. 환경 오류나 수집 오류를 기능 실패로 기록하지 마세요.
모든 조건에서 개발 중 로컬 단위 테스트로 red/green을 확인할 수 있습니다. 최종 HTTP 과제 검증용 Vitest 테스트는 integration/에 작성하고 APP_URL을 사용하세요. 최종 환경 검증은 아래 조건별 경로를 따라야 합니다.
test/baseline.test.ts는 미구현 기준 상태만 검증하므로 완료 후 회귀 테스트로 실행하거나 수정하지 마세요. 자신이 작성한 테스트 파일을 명시적으로 실행하세요.
공개 smoke 테스트 통과를 과제의 모든 인수 기준 통과로 해석하지 마세요.`,
    conditionInstructions[condition],
  ]
  if (condition !== "A") {
    sections.push(`연결된 Redpact 런타임: ${redpactOrigin}
실행 대상 경로에는 항상 자신의 체크아웃 ${checkout}을 지정하세요. 공유 primary 설정은 진행자가 준비하며 변경하지 마세요.
가이드가 없거나 계약을 확인할 수 없으면 관리형 검증을 차단 상태로 보고하세요.`)
  }
  if (verificationGuide) {
    sections.push(`진행자가 제공한 검증 가이드:\n${verificationGuide}`)
  }
  if (task.id === "ui") {
    sections.push(`UI 과제의 Playwright 테스트는 ui-tests/task.spec.ts에 작성하세요. 공유 functional target은 baseline.spec.ts와 task.spec.ts를 실행합니다.
UI 공개 계약: 최소 수량 입력은 접근 가능한 number 입력 한 개(spinbutton)로 제공하세요.
버튼의 접근 가능한 이름은 Apply, Reset, Retry로 지정하세요. Reset은 입력값도 빈 문자열로 돌립니다.
기존 #orders tbody와 행의 Order, Quantity, Total cents 열 순서를 유지하세요.
로딩·결과·빈 상태·오류는 role="status"로 제공하고 영어로 표시하세요. 빈 결과에는 "No orders", 오류에는 "Failed"를 포함하세요.
1440×900 및 390×844의 실제 브라우저에서 기능·키보드·가로 넘침을 확인하고 스크린샷을 기록하세요. 검증하지 못했다면 명시하세요.`)
  }
  sections.push(`완료 보고에는 변경 파일, 수행한 테스트와 실제 결과, 최종 검증 경로 및 실행 ID(있는 경우), 남은 실패·차단·미검증 상태, 정리 결과를 포함하세요.
관찰하지 않은 성공이나 토큰 사용량을 추정해서 기록하지 마세요. 토큰과 시간은 진행자가 별도 수집합니다. 제한시간에 도달하면 작업을 중단하고 현재 결과를 보고하세요.`)
  return sections.join("\n\n")
}
