---
title: HTTP와 MCP 인터페이스
description: 공유 서비스, 요청 승인과 로컬 접근 경계를 설명합니다.
---

# HTTP와 MCP 인터페이스

## HTTP 레퍼런스

실행 중인 서버는 `/openapi.json`, `/docs`(Swagger UI), `/swagger`, `/redoc`을 제공합니다.
Hono 라우트 메타데이터와 공유 validator가 API 스키마를 생성합니다. 필드별 정본은
이 생성 레퍼런스이므로 전체 HTTP 스키마를 Markdown에 복사하지 않습니다. 에셋은
로컬 번들입니다. 이 API 문서 라우트는 공개 Next.js 문서 사이트와 별개입니다.

HTTP와 MCP는 같은 애플리케이션 workflow로 진입하고 실행·설정 검증을 공유합니다. 읽기 전용 검사는
코드를 실행하지 않습니다. 명시적 변경 라우트는 뷰어 밖에서 호출해도 해당 사전조건을
검사합니다. [아키텍처](architecture.md)를 참고하세요.

## 모델에 노출되는 도구

| 도구 | 계약 |
| --- | --- |
| `get_workspace_status` | 절대 체크아웃 `path`; 읽기 전용 설정 진단, 기존 연결, 승인 대기, 활성·최근 실행과 정리 문제 |
| `get_review_context` | 실행 `kind`와 `id`; 제한된 실패 정보, 기록된 근거 참조, 캡처된 승인 미리보기와 상대 뷰어 검토 경로 |
| `configure` | 절대 실행 `path`의 `describe`, `inspect`, `validate`. 스키마, 루트, 진단과 선택적 계획 반환 |
| `run_tests` | 절대 `path`, 선택적 정확한 `tests` 경로. Integration 제출·실행 |
| `get_run` | 반환된 실행 또는 검토 `id`로 상태, 결과와 환경 정리 조회 |
| `run_unit_tests` | 기존 체크아웃의 절대 `path`로 설정된 전체 Unit 명령 실행 |
| `run_playwright` | 기존 체크아웃의 절대 `path`, 필수 선언된 `target`, 선택적 `viewport` |
| `list_executions` | 체크아웃의 절대 `path`, 선택적 반환 커서 `before`로 세 실행 유형의 보존된 이력 조회 |
| `get_execution` | `kind`, `id`와 `detail`로 결과, 제한된 로그, 캡처된 테스트 소스 또는 기록된 PNG 조회 |
| `cancel_execution` | `kind`, `id`로 해당 실행의 기존 수명주기에 따라 취소 |

실행은 공유된 고정 프로젝트 설정에서 도출하며 `selection` 입력은 거부합니다.
Configure는 설정 저장, 컨테이너 시작, 테스트 승인을 하지 않습니다.
Describe 후 호스트 에이전트로 파일을 작성하고 같은 체크아웃을 validate하세요.
파일 편집과 native Git 작업은 호스트 에이전트가 담당합니다. 이 도구들은 Git 워크트리를
생성하거나 임의 셸 명령을 받거나 독립적인 컨테이너 관리를 제공하지 않습니다.
실행 workflow가 자신의 임시 환경을 준비하고 정리합니다.

`list_executions`로 같은 체크아웃의 증거를 찾고 `get_execution`에
`kind: integration | unit | playwright`와 ID를 전달합니다. 관찰되지 않은 체크아웃은
프로젝트 등록 없이 빈 이력을 반환합니다. `detail: source`에는 `sourcePath`가 필요하며
현재 파일이 아닌 기록된 Integration 또는 Playwright 테스트 코드를 읽습니다.
Unit은 전체 명령 출력을 보존합니다. `detail: image`에는 Playwright `artifactId`가
필요하고 `side: before | after`(기본 `after`)를 받으며 최대 8 MiB의 PNG 이미지 콘텐츠를
반환합니다. 더 큰 이미지, 동영상과 trace는 뷰어를 사용하세요.
과거 증거의 통과는 현재 코드의 최신성이나 사람의 수락을 입증하지 않습니다.

세 실행 도구는 요청 시 인스턴스 승인 정책을 캡처합니다. Auto는 기존 실행 workflow를
통해 시작합니다. Ask는 프로젝트 코드를 실행하지 않고 `awaiting_approval` 검토 ID와
MCP App 카드를 반환합니다. Integration은 환경 다음 테스트 승인 순서를 유지하고,
Unit과 Playwright는 캡처한 요청을 한 번 승인합니다. 모델은 승인하거나 정책을 바꿀 수
없습니다. `get_execution` result는 검토 ID를 받고 Unit/Playwright 카드를 갱신합니다.
대기 중 검토에는 실행의 로그·소스·이미지가 없습니다. 수락 후 Unit/Playwright 검토 ID는
연결된 실행 증거를 조회하며, Integration 로그·소스에는 실제 실행 ID를 사용합니다.

`cancel_execution`은 세 종류의 대기 중 검토 ID를 승인 없이 취소합니다. 취소 후 결과를
조회해 테스트 결과와 정리 실패를 구분하세요. Unit과 Playwright의 기존 정리 재시도
동작은 유지됩니다.

시작 기본값이나 기존 `worktreeId`로 대상을 찾을 수 있지만 작성 시 명시적 경로를
권장합니다. 발견은 선언된 루트와 native Git 등록을 관찰할 뿐 워크트리를 만들거나
테스트를 실행하지 않습니다. 수집 오류는 진단으로 남습니다. 런타임 경계는
[실행](execution.md)을 참고하세요.

기존 체크아웃 연결은 `{ path }`만 받는 `POST /api/projects`와
`POST /api/projects/:id/worktrees`를 사용합니다. MCP 실행도 같은 연결 워크플로를
사용합니다. 연결은 같은 식별로 과거 연결 해제 기록을 재활성화할 수 있지만 워크트리를
생성하거나 `.redpact/settings.json`을 쓰지 않습니다. 프로젝트·인스턴스 설정·tracking
조회와 work item·제출·실행·일반 환경 list/get/stop 계약은 유지합니다.
프로젝트 관리, 설정 쓰기, 디렉터리 선택기, 일반 파일, Git 변경·그래프·PR·워크트리
생성, 수동 Container 시작, 호스트 플러그인 업데이트 API는 없습니다.

## 요청 승인과 Apps

번들 리소스는 `ui://redpact/environment.html`, `ui://redpact/tests.html`입니다.
응답 snapshot을 표시하며 지속 polling·구독을 하지 않습니다. Environment 카드는 실행 시
의존성 선택 없이 각 의존성의 고정 종류를 한 번씩 표시합니다. `get_run`은 Integration
snapshot을, `get_execution`은 Unit/Playwright 검토를 갱신합니다. 연결된 뷰어에서 실행
이력·상세 증거·복구 제어를 확인합니다.

새 실행 요청은 인스턴스 `approval` 정책을 캡처합니다.

- `auto`: 즉시 실행을 수락합니다.
- `ask`: `awaiting_approval` 검토 ID를 반환합니다. Integration은 환경 승인 후 테스트
  묶음을 승인합니다. Unit은 전체 명령·Dockerfile·디렉터리·입력 식별자를 보여줍니다.
  Playwright는 선언된 대상·목적·viewport와 앱·테스트 입력 식별자를 보여줍니다.
  필요한 명시적 승인 전에는 컨테이너나 테스트 프로세스를 시작하지 않습니다.

Integration 승인은 캡처된 제출·고정 실행 계획·revision·설정 digest에 결합되며 나중의
파일 변경은 캡처 테스트를 대체하지 않습니다. Unit과 Playwright 승인은 캡처한 실행 명세와
설정·입력 digest에 결합됩니다. 수락 시 입력을 다시 읽고, 바뀐 입력을 대신 승인하지 않고
거부합니다. Unit은 컨테이너 빌드 전에 복사한 소스를 확인하고, Playwright는 캡처한 테스트를
확인한 뒤 승인된 앱 식별자를 환경 준비 단계까지 전달합니다. 외부 입력과 fingerprint의
한계는 [실행](execution.md)을 참고하세요. 승인은 테스트 충분성·TDD red·코드 변경에 대한
사람의 수락을 입증하지 않습니다.

App 전용 `review_action`, `execution_review_action`, `set_approval_policy`는 이를
준수하는 클라이언트에서 모델에 숨겨집니다. 추측 불가능한 capability는 UI 전용 `_meta`로만
전달되며 모델 콘텐츠에 포함되지 않습니다. Revision 검사로 오래된 작업을 거부하고 중복
최종 승인은 기존 실행을 반환합니다. 기본 정책 변경은 새 요청에만 적용됩니다. Apps가 없는
호스트는 연결된 검토 화면에서 명시적으로 승인할 수 있지만 텍스트 승인으로 대체하거나
Ask를 Auto로 몰래 바꿀 수 없습니다. 뷰어의 명시적 검토 동작도 같은 workflow를 사용하며
아래의 신뢰된 로컬 HTTP 경계를 유지합니다.

브라우저 번들은 공식 Apps SDK를 사용하며 서버는 기존 SDK로 리소스·도구 메타데이터를
등록합니다. 카드에 에셋을 포함하고 iframe HTTP 대신 host bridge를 사용합니다.
영속 검토 복구는 [저장소](storage.md)에서 설명합니다.

## 대화 맥락

`get_workspace_status`는 지정한 체크아웃을 등록하거나 코드를 실행하지 않고 조회합니다.
공유 설정 루트와 진단, 이미 관찰된 연결, 승인 대기와 제한된 실행 요약을 반환합니다.
활성 실행과 미완료 정리는 최근 이력 페이지와 별도로 조회합니다. 상태는 관찰한 사실과 진단을 보고하며 명령을 지시하거나 작업을 미리 승인하지 않습니다.

`get_review_context`는 실행 또는 대기 요청 하나의 제한된 실패 정보, 근거 참조와 상대
`reviewPath`를 반환합니다. 같은 뷰어 출처와 결합해서 사용하며 환경 인증 값이나 UI
capability는 포함하지 않습니다. 실패·근거 참조를 각각 최대 20개와 전체 개수로 반환하고,
보존된 상세는 `get_execution`으로 확인합니다. 관련 현재 입력을 실제로 비교하기 전에는
최신성이 `unknown`이며 사람의 수락은 `not_recorded`입니다. Unit 명령 실패를 자동으로
assertion 실패로 분류하지 않습니다.

Integration 승인 미리보기는 요청 당시 저장된 앱 서비스 선택, 의존성 종류와 제출된
테스트 파일·시나리오 제목을 보여줍니다. 서비스 이름은 최대 50개와 전체 `serviceCount`로
반환합니다. 현재 설정 대신 저장된 요청을 사용하며 뷰어의 환경 승인 동작 전에 표시합니다.

Playwright 종료만으로 환경 제거를 증명하지 않습니다. 카드와 검토 요약은 명시적인 정리
근거가 없으면 정리를 `unknown`으로, 정리 오류가 기록되었으면 `failed`로 표시합니다.

정확한 기록 뷰어는 `GET /api/review-context?kind=...&id=...`를 사용합니다.
`GET /api/workspace-status?path=...`는 읽기 전용 체크아웃 관찰 API입니다. 명시적인 뷰어 승인·취소는
`/api/execution-reviews/:kind/:id/approve`와 `/cancel`을 사용하며 승인은 예상 revision과
Integration의 해당 승인 대상을 확인합니다. 기존 same-origin·local-host 경계를 유지합니다.
모델용 도구에는 뷰어 승인 작업을 노출하지 않습니다. [탐색](frontend.md)을 참고하세요.

워크트리의 `scope=evidence` 이벤트 구독에는 Integration과 Unit/Playwright 검토 기록,
보존된 실행 근거와 공유 프로젝트 설정이 포함됩니다. 다른 워크트리의 기록을 받지 않으면서
채팅으로 만든 요청과 승인·취소 변경을 연결된 검토 화면에 반영합니다. 명시적인 워크트리
ID가 필요하며 체크아웃을 사용할 수 없어도 보존된 실행 근거를 계속 관찰합니다.

## 로컬 접근 경계

기본 및 데스크톱 실행은 loopback에 bind합니다. 서버는 loopback Host, 정확한 browser
Origin과 Fetch Metadata도 검사하고 cross-site/same-site 요청을 거부합니다.
Bearer token은 필요 없습니다. 신뢰된 로컬 프로세스는 HTTP와 파일에 접근할 수 있어
사용자 간 격리나 악성 로컬 프로세스로부터의 격리가 아닙니다.

컨테이너 관찰은 명시적으로 `--host 0.0.0.0`으로 실행하되 호스트 loopback에만 포트를
공개할 수 있습니다. 원격 인증이나 다중 사용자 접근을 도입하는 것은 아닙니다.
전송이나 preview 연결을 바꿔도 수락 검사를 보존하세요.

구현: [MCP 등록](../app/server/src/interfaces/mcp/routes.ts),
[App 메타데이터](../app/server/src/interfaces/mcp/apps.ts),
[HTTP 문서](../app/server/src/interfaces/http/docs/routes.ts),
[검토 workflow](../app/server/src/workflows/review-tests.ts).

런타임 업데이트 상태와 명시적 확인·설치는 `GET /api/updates`, `POST /api/updates/check`, `POST /api/updates/install`을 사용합니다. 설치에는 발견된 버전과 일치하는 `{ version }`과 확인된 CLI 부모 프로세스가 필요합니다. 캐시의 `canInstall`, `busy`, `error`, `installError`는 기능 지원·작업·실패를 구분합니다. 조회는 설치하지 않습니다. 같은 출처·로컬 호스트 경계를 유지하고 임의 명령이나 레지스트리 URL을 받지 않습니다. [런타임 업데이트](installation.md)를 참고하세요.
