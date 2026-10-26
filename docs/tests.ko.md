---
title: 검증 작성 가이드
description: 단위 테스트 명령, 통합 시나리오, 브라우저 테스트를 선택하고 올바른 워크트리의 실행 증거를 보존합니다.
---

# 검증 작성 가이드

먼저 [첫 변경 검토하기](review-workflow.md)에서 어떤 근거가 필요한지 정하세요. 이 페이지는 에이전트와 함께 그 근거를 만드는 작성 가이드입니다. 검증할 동작에 따라 테스트를 선택하세요. 프로젝트를 아직 연결하지 않았다면 [첫 실행](first-run.md)부터 시작하세요.

| 목적 | 테스트 유형 | 실행 진입점 | 기록되는 결과 |
|---|---|---|---|
| 기존 테스트 명령 실행 | Unit | `redpact tests run --kind unit` 또는 앱의 Unit 컨트롤 | 명령 상태, 종료 코드, 출력 |
| 공개 API와 의존성 검증 | Integration | `redpact tests run --kind integration` 또는 Integration 컨트롤 | 수집한 Vitest 소스, 케이스, 관찰된 단계 |
| 브라우저 상호작용 검증 | Playwright, `purpose: "functional"` | `redpact tests run --kind playwright` 또는 Tests → Playwright 컨트롤 | 시나리오와 단계 판정, 진단 첨부 파일 |
| 검토할 애플리케이션 상태 표시 | Playwright, `purpose: "capture"` | `redpact tests run --kind playwright` 또는 Tests → Playwright 컨트롤 | 이름이 있는 스크린샷, 소스, 실행 상세 |

스크린샷으로 화면의 모습을 확인할 수 있습니다. 어설션은 테스트가 실제로 확인하는 동작을 검증합니다. 기능 검증과 화면 검토가 모두 필요한 변경이라면 둘 다 남기세요.

## 테스트 우선 개발

Redpact skill은 독립 skill로 설치하든 플러그인에 포함하든 테스트 가능한 동작 변경에
Red → Green → Refactor를 적용합니다. 구현 전에 적절한 Unit, Integration 또는
Playwright functional 경계를 선택합니다.

1. **Red:** 회귀 테스트를 작성하고 기존 동작에서 실행하여 의도한 어설션 실패를
   관찰합니다. 0이 아닌 종료 코드, 수집 오류, 환경 미준비는 red가 아닙니다.
   컴파일에 필요한 최소 연결 지점은 동작 없이 유지하고 증거에 명시합니다.
2. **Green:** 같은 의도의 어설션을 통과시키는 최소 변경을 구현하고 최신 애플리케이션
   입력으로 다시 실행합니다. 검토된 어설션을 유지하며 잘못된 fixture는 테스트를
   약화하는 대신 원인을 명확히 진단합니다.
3. **Refactor:** 필요하면 동작을 유지하면서 구조를 개선한 뒤 최종 소스에서 영향받는
   테스트와 필수 회귀 검사를 다시 실행합니다.

인계에는 테스트 식별자, 명령 또는 관리 실행 ID, 실제 실패한 어설션과 관찰된 green
결과를 남깁니다. 작업을 위임했다면 부모 에이전트가 통합된 소스를 검증합니다.
로컬 red/green 결과와 연결된 인수 증거는 구분하며 셸 직접 실행은 Redpact 기록을
생성하지 않습니다. 구현 후 작성한 테스트는 TDD를 입증하지 않으므로 사실대로 보고합니다.

문서와 정적 설정 변경은 억지로 실패하는 동작 테스트를 만들지 않고 관련 정적·빌드·리뷰
검사를 수행합니다. 시각적 변경만 있어도 실제 애플리케이션 캡처는 필요합니다.
이 저장소의 viewport와 검사 요구사항은 [프런트엔드 규칙](frontend.md)을 참고하세요.
실행 승인은 연결된 뷰어에서 사람이 수행하며 코드 수락을 뜻하지 않습니다.

## 기존 단위 테스트 명령 연결

공유 `.redpact/settings.json`에 `unitTests`를 추가하세요. 다음 예시는 의존성을 설치하고 애플리케이션을 `/workspace`에 복사하는 프로젝트의 `unit.Dockerfile`이 있다고 가정합니다.

```json
{
  "unitTests": {
    "dockerfile": "unit.Dockerfile",
    "cwd": "app/server",
    "command": "pnpm test",
    "patterns": ["app/server/test/*.test.ts"]
  }
}
```

다른 설정을 유지하면서 이 필드를 기존 설정에 합치세요. 경로는 선택한 워크트리를 기준으로 해석됩니다. Dockerfile은 `/bin/sh`, 패키지 관리자, 의존성을 제공해야 합니다. Redpact가 이미지의 시작 명령을 대체하므로 설치는 Dockerfile 빌드 단계에서 수행해야 합니다. [설정](configuration.md)을 참고하세요.

프로젝트의 **Tests** 페이지에서 **Unit**을 선택하면 기본 체크아웃을 대상으로 합니다. 기능 워크트리는 해당 워크트리의 **Unit** 실행 컨트롤을 사용하세요. Play 아이콘은 공유 프로젝트 실행 범위를 사용합니다. 명시적 `fileCommand` 설정이 없으면 Unit 명령 전체를 실행합니다. 소스 파일 선택은 실행 대상을 필터링하지 않습니다. `patterns`는 카탈로그와 파일 명령의 후보를 결정합니다. 감시 모드를 끄고 종료되는 명령을 사용하세요.

각 실행은 새 컨테이너를 사용합니다. 호스트에 설치된 의존성을 사용하지 않으며 Compose 의존성 선택도 필요하지 않습니다. Redpact는 명령 결과와 크기가 제한된 stdout/stderr를 기록하며 텍스트 출력에서 개별 테스트 판정을 추론하지 않습니다.

## 통합 시나리오 작성

관리되는 통합 테스트와 헬퍼를 `tests.directory` 아래에 두세요(기본값은 Git으로 추적하는 루트 `integration/` 디렉터리입니다). 이 테스트는 Vitest로 실행되며 HTTP 같은 실제 애플리케이션의 공개 경계를 검증합니다. Unit 패턴은 이 디렉터리 밖에 두세요. 할당된 포트를 하드코딩하지 말고 [설정](configuration.md)으로 애플리케이션 URL을 연결하세요.

에이전트가 시나리오를 작성할 때는 Redpact 에이전트에게 번들에 포함된 [`createSteps` 헬퍼](../plugins/redpact/skills/redpact/assets/steps.ts)를 해당 디렉터리에 `steps.ts`로 복사하도록 요청하세요. 수집할 소스와 함께 보관하세요. 다음 테스트는 `/api/health` 엔드포인트가 있는 애플리케이션에 `APP_URL`이 설정되어 있다고 가정합니다. 둘 다 실제 애플리케이션에 맞게 조정하세요.

```ts
import { expect, test } from "vitest"
import { createSteps } from "./steps"

test("Application responds successfully", async (context) => {
  const step = createSteps(context)
  const response = await step("Request application health", () =>
    fetch(`${process.env.APP_URL}/api/health`),
  )
  await step("Verify the application is healthy", () => {
    expect(response.status).toBe(200)
  })
})
```

각 단계를 순서대로 await 하세요. 작업이나 어설션을 콜백 안에 넣고 실패가 전파되게 하세요. 의미 있는 동작과 확인을 별도 단계로 나누세요. 제목과 주석은 의도를 설명하고, 관찰된 단계는 실행이 어디까지 도달했는지 보여줍니다. 제출할 시나리오 제목과 단계는 작업의 언어로 작성하세요. 뷰어 언어를 바꿔도 기록된 소스는 번역되지 않습니다.

에이전트에게 실제 작업 체크아웃의 절대 경로,  선택적으로 `tests.directory` 기준의 정확한 테스트 경로를 지정해 `redpact tests run --kind integration`를 호출하도록 요청하세요. 헬퍼는 수집 번들에 남습니다. `redpact tests run --kind integration`은 통합 테스트를 처리하며 단위 테스트 명령과 Playwright 소스는 각자의 실행 경로를 사용합니다.

반환된 상태를 읽고 `redpact runs show`으로 실행을 확인하세요. 반환된 식별자를 보존하고 연결된 인스턴스에서 증거가 의도한 워크트리에 속하는지 확인하세요. 셸에서 직접 테스트를 실행해도 Redpact 제출은 생성되지 않습니다. 프로젝트의 Integration 실행 작업은 현재 소스를 새 제출로 수집합니다. 기록된 소스는 이후 편집과 분리됩니다.

격리된 픽스처 데이터를 사용하세요. 저장 작업은 즉시 응답뿐 아니라 다시 읽은 결과도 검증하세요. 회귀 테스트는 실제 실패한 어설션을 보존하고 업데이트된 애플리케이션 입력으로 다시 실행하세요. 수집 오류와 애플리케이션 접근 불가는 준비 실패이며 의도한 어설션이 실패했다는 증거가 아닙니다.

## Playwright 범위와 목적 선택

타깃에는 서로 독립적인 두 속성이 있습니다.

- **Scope**는 유지 방식을 정합니다. `worktree`는 작업 전용 코드이고 `project`는 프로젝트와 함께 유지하는 코드입니다. 생략하면 `project`입니다.
- **Purpose**는 표시 방식을 정합니다. `capture`는 검토할 장면을 만들고 `functional`은 동작을 검증합니다.

설정된 시나리오 루트 아래에 다음 구조를 사용하세요.

```text
ui-tests/
  worktree/
    captures/
    tests/
  project/
    captures/
    tests/
```

Git 무시 규칙에 `ui-tests/worktree/`를 추가하세요. 유지할 시나리오와 헬퍼는 커밋하세요. 헬퍼를 시나리오 루트 안에 두고 프로젝트 시나리오가 워크트리 초안에 의존하지 않게 하세요.

`playwright.targets`에 서로 겹치지 않는 네 항목을 설정하세요.

```json
{
  "worktree-captures": { "scope": "worktree", "purpose": "capture", "testMatch": ["worktree/captures/**/*.ts"] },
  "worktree-tests": { "scope": "worktree", "purpose": "functional", "testMatch": ["worktree/tests/**/*.ts"] },
  "project-captures": { "scope": "project", "purpose": "capture", "testMatch": ["project/captures/**/*.ts"] },
  "project-tests": { "scope": "project", "purpose": "functional", "testMatch": ["project/tests/**/*.ts"] }
}
```

위 예시는 `targets` 값만 보여줍니다. [설정](configuration.md)에 따라 애플리케이션 서비스, 포트, 시나리오 디렉터리도 설정하세요. 파일 하나가 여러 타깃에 일치할 수 없습니다. 각 타깃은 선택한 워크트리의 실제 애플리케이션을 대상으로 한 번 실행됩니다.

## 브라우저 시나리오 작성

`@playwright/test`에서 `test`와 `expect`를 가져오세요. Redpact가 브라우저 실행기와 애플리케이션 기본 URL을 제공합니다. 수집된 시나리오 루트 안에서는 상대 경로 헬퍼와 Node 내장 모듈을 사용할 수 있습니다. 이 실행기는 임의의 추가 시나리오 의존성이나 프로젝트 Playwright 설정의 평가를 지원하지 않습니다.

다음 캡처 예시는 Settings 경로와 제목이 있다고 가정합니다.

```ts
import { expect, test } from "@playwright/test"

test("Settings page is ready for review", async ({ page }, info) => {
  await test.step("Open Settings", async () => {
    await page.goto("/settings")
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  })
  await page.evaluate(() => document.fonts.ready)
  await info.attach("Settings / General / Initial state", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
```

`Page / Group / Capture name`처럼 안정적이고 의미를 설명하는 이름을 사용하세요. 뷰어는 체크포인트 선택기에 전체 이름을 표시하며, `/`는 이름 규칙일 뿐 그룹 생성 지시가 아닙니다. 파일과 체크포인트 탐색은 [캡처 살펴보기](results.md)를 참고하세요. 빈 폼, 검증 오류, 저장 결과처럼 유용한 상태를 선택하세요. 고정된 시간만큼 대기하는 대신 애플리케이션 상태와 폰트가 준비되기를 기다리세요. 변경을 판단할 맥락이 충분하도록 뷰포트나 의미 있는 영역을 캡처하세요.

기능 타깃에서는 `test.step`과 관찰 가능한 결과에 대한 어설션을 사용하세요. 이동하고 폼을 제출한 뒤 결과 상태와 관련 데이터의 보존 여부를 검증하세요. 스크린샷은 선택적인 진단 자료입니다. 기능 테스트 스크린샷은 프로젝트 캡처 갤러리에 표시되지 않습니다.

**Tests → Playwright → Run Tests**에서 워크트리와 타깃을 선택하거나 워크트리의 **Playwright** 컨트롤을 사용하세요. 애플리케이션 서비스와 의존성을 선택하세요. 기본 뷰포트는 1920 × 1080이며 설정이나 실행 옵션으로 바꿀 수 있습니다. 저장된 이미지를 보는 것만으로 실행이 시작되지는 않습니다.

## 작업의 질문에 답하는 단언 설계하기

단언을 고르기 전에 확인할 동작을 적어 보세요. “요청이 200을 반환했다”도 유용하지만, 저장 기능이라면 보통 저장값을 다시 읽는 검증이 필요합니다. 잘못된 요청은 거부 여부와 함께, 관찰 가능하다면 원치 않는 상태 변경이 없었는지도 확인해야 합니다.

| 변경 | 확인할 만한 동작 | 필요할 때 추가할 근거 |
|---|---|---|
| 설정값 저장 | 공개 API나 새로고침 후 새 값 읽기 | 저장 완료 상태 캡처 |
| 잘못된 입력 거부 | 의도한 오류와 기존 데이터 유지 확인 | 검증 메시지 캡처 |
| 목록 필터링 | 일치하는 항목은 남고 알려진 불일치 항목은 사라짐 | 빈 결과와 결과가 있는 상태 캡처 |
| 의존성 실패에서 복구 | 정의된 오류 또는 재시도 동작 확인 | 설정된 의존성 종류 기록 |

무관한 기본값이 우연히 단언을 만족하지 않도록 구별하기 쉬운 fixture 값을 사용하세요. 테스트가 실행 순서에 의존하지 않게 작성하세요. 데이터를 만드는 시나리오는 필요에 따라 애플리케이션이 지원하는 인터페이스로 정리하세요. 공용 외부 인프라에 연결할 때 특히 중요합니다.

mock 기반 테스트는 구현된 대체 동작을 상대로 애플리케이션을 검증합니다. 실제 제공자의 인증이나 응답 계약이 작업의 주제라면 mock 결과만으로 답할 수 없습니다. 시나리오가 실제로 어느 의존성 경계를 확인했는지 명시하세요.

## 작업용 캡처를 유지되는 시나리오로 전환하기

현재 변경을 검토할 때만 필요한 장면은 `worktree/captures`에서 시작할 수 있습니다. 나중에도 확인할 가치가 있는 상태라면 최종 소스와 필요한 헬퍼를 유지되는 프로젝트 경로로 옮기고, project 타깃을 선택해 그 위치에서 실행하세요.

새 실행이 필요합니다. 파일을 옮기는 것만으로 이전 worktree 기록이 project 기록으로 바뀌거나 유지되는 갤러리에 들어가지는 않습니다. 새 타깃의 범위, 목적, 스크린샷 이름을 확인하세요. 기능 단언의 지속적인 결과가 프로젝트 회귀 검증에 필요하다면 기능 타깃으로 유지하세요.

## 충분한 테스트 인수인계 요청하기

Integration 작업은 다음처럼 요청할 수 있습니다.

> 프로젝트 공개 API와 수집되는 헬퍼를 사용해 보고된 동작에 집중하는 테스트를 추가해줘. 수정 전에 의도한 단언이 실제로 실패하는 것을 확인하고, 수정 후 실제 작업 체크아웃에서 통과하는 실행을 제출해줘. 단언 의도를 유지하고 두 실행 ID, 설정된 의존성 종류, 준비나 정리 문제를 알려줘.

사용자에게 보이는 UI 작업에서는 Redpact 플러그인이 동작 변경이 있을 때의 사용자 조작 검증과 데스크톱·모바일 viewport의 작업 전용 화면 캡처를 모두 기본으로 선택합니다. 캡처는 사람이 검토할 수 있도록 보존하며, 기능 단언을 대체하거나 에이전트가 이미지를 시각적으로 승인했다는 뜻은 아닙니다. 중요한 상태와 시나리오를 프로젝트에 남길지도 알려주세요. 렌더링되는 UI가 없는 브라우저 동작 변경에서 기능 증거만 필요하다면 그렇게 명시하세요.

## 증거를 보존하며 작업 마무리

두 Playwright 범위 모두 실행한 시나리오 소스와 아티팩트를 보존하며 작업 중에는
워크트리 초안을 계속 편집할 수 있습니다. 최종 기록 실행과 리소스 정리가 끝나면
에이전트에게 명시적인 [초안 정리 작업](execution.md)을 요청하세요. 뷰어에는 초안 정리
버튼이 없습니다. 실행 성공이나 머지가 초안을 자동으로 제거하지 않으며 보관된 증거는
계속 사용할 수 있습니다.

시나리오를 장기적으로 유지하려면 명시적으로 `project`로 옮기고 필요에 따라 import나
타깃 패턴을 수정해야 합니다.

[결과와 스크린샷](results.md), [문제 해결](troubleshooting.md), [문서 개요](index.md)로 이어가세요.

실행 요청에서 `executionScope: "all" | "changed"`를 선택할 수 있습니다. 테스트와
헬퍼는 담당 러너 디렉터리에 두세요. 변경 선택은 import 의존성을 분석하지 않으므로
구현 변경의 회귀 검증에는 `all`을 사용하세요. Integration의 정확한 `tests` 경로를
지정하려면 유효 실행 범위가 `all`이어야 합니다. Git·헬퍼·빈 선택 규칙은
[실행 선택](execution.md), 명시적 Unit 파일 명령 계약은 [설정](configuration.md)을
확인하세요.
