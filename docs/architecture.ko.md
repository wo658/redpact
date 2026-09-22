---
title: 아키텍처
description: 현재 구성 요소의 경계와 구현 선택의 이유를 설명합니다.
---

# 아키텍처

Redpact는 로컬 개발 검토 도구입니다. 프로젝트 체크아웃을 연결하고 제출된 테스트
의도와 소스를 기록하며, 테스트를 실행하고 관찰된 증거를 보여 줍니다. 테스트 성공,
설정 유효성, 애플리케이션 최신성, 사람의 수락은 서로 다른 사실입니다. 하나의 결과가
나머지를 입증하지는 않습니다.

## 구성 요소

```text
웹 / Tauri 뷰어 ── HTTP ─┐
                        ├── workflows (Imperative Shell) ── core (순수 판단)
에이전트 / MCP Apps ─ MCP ┤                 │
시작 / 관찰 ─────────────┘                 └── adapters ── Git / 파일 / 런타임

문서 사이트 ── docs/*.md
```

| 소스 | 책임 |
| --- | --- |
| `app/server/src/interfaces` | Hono HTTP 라우트와 MCP 전송, 요청 검증, 응답 구성 |
| `app/server/src/workflows` | 단일 기능 조회, 실행, 승인, 관찰, 복구, 종료를 포함하는 모든 애플리케이션 유스케이스 |
| `app/server/src/core` | 순수 정책, 계산, 검증 스키마, 포맷팅. 명시적인 입력 데이터로 판단이나 값을 생성 |
| `app/server/src/core/types` | 데이터와 의존성의 타입 전용 계약. 런타임 export와 barrel 없음 |
| `app/server/src/adapters` | 파일, native Git, 소스 파싱, 프로세스, Docker, Playwright |
| `app/server/src/main.ts` | 구체 의존성 연결과 프로세스 수명주기 |
| `app/web` | 연결된 React 뷰어와 별도 번들 MCP 카드 |
| `app/desktop` | 로컬 런타임을 호스팅하는 Tauri 데스크톱 앱 |
| 별도 `redpact-web` 저장소 | 웹사이트와 문서 렌더러. 이 저장소의 `docs/`를 직접 읽음 |

## 경계 규칙

서버는 Functional Core, Imperative Shell 구조를 사용합니다. HTTP, MCP와 내부
애플리케이션 트리거는 유스케이스를 실행할 때 workflow로 진입합니다. 전송 코드는 순수
스키마와 포맷터를 직접 사용할 수 있지만, 애플리케이션 동작을 구현하려고 adapter에
직접 접근하지 않습니다. workflow 디렉터리에는 기능별 서비스 팩토리와 여러 서비스를
조합하는 작업이 모두 포함됩니다. 기존 `createXxx` 이름이 Core를 의미하지는 않습니다.

Workflow는 사실을 수집하고 필요한 순수 정책을 호출한 뒤, 주입된 의존성을 통해
부수 효과를 수행합니다. 실행 순서, 취소, 잠금, 복구와 정리를 소유합니다. 단순 조회는
adapter 결과를 직접 반환할 수 있습니다. 데이터를 전달하기만 하는 Core 함수를 만들거나
모든 workflow에 Core 호출을 강제하지 않습니다. HTTP와 MCP는 같은 유스케이스 구현을
사용하며 동작을 중복 구현하지 않습니다.

Core는 저장소, runner나 부수 효과가 있는 서비스 기능 대신 데이터를 받습니다.
Workflow, adapter, interface는 타입 import로도 참조하지 않습니다. 정책에 필요한
시각, 무작위 식별자와 외부 관찰 결과는 Shell이 전달합니다. 내부 계산과 결정적인
해시 계산은 허용하지만 호출자 소유 데이터를 변경하거나 외부 상태에 암묵적으로 접근하면
안 됩니다. 스키마와 포맷터는 전송 계층과 adapter에서도 재사용할 수 있습니다.
Adapter는 workflow나 interface를 import하지 않으며, workflow도 전송 구현을 import하지
않습니다.

최종 판정 우선순위, 리뷰 탭 가용성, 컨테이너 선택처럼 의미 있는 규칙을 정책으로
분리합니다. 모든 대입을 함수로 분리하지 말고 관련 규칙을 함께 둡니다. 순차 I/O와
그 제어 흐름은 Shell에 둡니다. Run의 실행 수락과 최종 판정은 Environment의 예약,
리소스 상태와 종료 수락과 구분합니다. 종료 workflow는 수락을 막고 취소를 확인한 뒤
소유 리소스를 제거합니다. 정리 실패는 테스트 판정과 구분합니다. 판단을 이동할 때
잠금과 관찰 순서를 보존해야 합니다. 순수한 판단이 조회·확인·저장 순서를 원자적으로
만들어 주지는 않습니다.

아키텍처 테스트는 계층 간 import, 타입 import를 포함한 서버 의존성 순환, 타입 전용
계약, 검토된 Core 외부 import, 시계·무작위 값·프로세스 환경 접근 등의 일반적인 외부
효과를 검사합니다. 이는 정적 회귀 방지 검사이며 순수성의 증명은 아닙니다. 주입된
콜백, 입력 변경과 라이브러리 동작은 여전히 검토와 해당 동작 테스트가 필요합니다.

TypeScript, Hono와 일반 함수를 사용합니다. controller 클래스, DI 컨테이너, 범용
저장 엔진, 추측성 wrapper를 만들지 않습니다. 기존 라이브러리와 Node 기본 기능을
재사용합니다. 레코드 파일 사이에 범용 이벤트 버스, 명령 해석기나 트랜잭션 엔진은 없습니다.

## 현재 구현 선택

- 런타임은 인스턴스당 단일 writer가 JSON과 아티팩트 파일을 저장합니다.
  SQLite/Drizzle 런타임과 이전 형식 마이그레이션 계층은 없습니다.
- 모든 index 형식의 상태·제외 규칙, patch와 변경 작업은 native Git이 담당합니다.
  저장소 발견과 지원되는 blob 읽기에는 isomorphic-git을 유지합니다.
- Parcel 파일 관찰은 범위별 갱신을 유도하며 테스트를 자동 실행하지 않습니다.
- ts-morph는 TypeScript 표준 라이브러리 선언을 로드하지 않고 격리된 제출 파일의
  심볼에서 정적 테스트 의도를 추출합니다. Vitest는 실제 통합 결과를 기록합니다.
  정적 파싱은 어설션 실행이나 전체 import 수집을 입증하지 않습니다.
- Testcontainers는 컨테이너 시작을 담당합니다. Redpact는 입력 캡처, 수락,
  상태 관찰, 리소스 식별, 취소와 정리를 담당합니다.
- Unit 명령과 Playwright는 임시 컨테이너에서 실행합니다. Integration Vitest는
  임시 컨테이너에서 실행합니다. Integration과 Playwright는 실행별 네트워크에서
  서비스 이름으로 앱에 접근합니다.
- MCP Apps는 요청 승인과 자격 증명 입력을 구현합니다. 클라이언트가 App 전용
  메타데이터를 모델 문맥에서 숨겨야 합니다. 코드 검토 수락이나 신뢰된 로컬
  프로세스로부터의 격리를 입증하는 기능은 아닙니다.
- GitHub 게시에는 native Git과 인증된 `gh`를 재사용하며 PR 식별자는 GitHub가 소유합니다.

독립 npm 설치는 CLI 부모가 소유 서버를 종료한 뒤 확인된 npm/pnpm 관리자에 패키지 교체를 맡깁니다. 네이티브 데스크톱은 Tauri 소유권을 유지합니다. 두 경로 모두 뷰어에 업데이트 상태를 제공하며 SemVer 비교는 기존 node-semver 구현을 사용합니다. 설치 제약과 재시작 동작은 [런타임 업데이트](installation.md)를 참고하세요.

## 범위와 증거

현재 Git 체크아웃 발견과 불변 실행 식별자는 별개입니다. 체크아웃이 사라져도 과거
결과는 남지만 새 실행은 불가능합니다. 공유 고정 설정은
[설정 소유권](settings-reference.md)에서 정의하며 워크트리 식별 레코드에 복제하지 않습니다.

세부 계약은 [실행](execution.md), [저장소](storage.md), [인터페이스](interfaces.md),
[Git 작업](git.md), [프런트엔드 규칙](frontend.md)을 따릅니다. 현재 제약은 해당 기능
옆에 기록합니다. 과거 제안, 폐기된 결정, 테스트 개수와 머지 일지는 Git 기록에 남기며
별도의 현재 상태 문서로 유지하지 않습니다.

구현: [의존성 연결](../app/server/src/main.ts),
[Core 계약](../app/server/src/core/types/services.ts),
[아키텍처 테스트](../app/server/test/architecture.test.ts).
