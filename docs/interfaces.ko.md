---
title: HTTP와 MCP 인터페이스
description: 공유 서비스, 요청 승인, 자격 증명과 로컬 접근 경계를 설명합니다.
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
| `configure` | 절대 실행 `path`의 `describe`, `inspect`, `validate`. 스키마, 루트, 진단과 선택적 계획 반환 |
| `run_tests` | 절대 `path`, 선택적 정확한 `tests` 경로. Integration 제출·실행 |
| `get_run` | 반환된 실행 또는 검토 `id`로 상태, 결과와 환경 정리 조회 |
| `request_keys` | 관찰된 `projectId`와 필요한 선언 자격 증명 `names`. 직접 사용자 입력 요청과 가용성 반환 |

실행은 공유된 고정 프로젝트 설정에서 도출하며 `selection` 입력은 거부합니다.
Configure는 설정 저장, 컨테이너 시작, 테스트 승인을 하지 않습니다.
Describe 후 파일을 작성하고 같은 체크아웃을 validate하세요. Unit과 Playwright는 뷰어나
HTTP에서 실행합니다. Unit은 설정된 명령을 실행하고, Playwright는 기능 또는 캡처 target을
선택해 UI Review 증거를 보존합니다. MCP에는 취소·정리가 없으며 사용자가 뷰어에서 조기 종료와 재시도를 관리합니다.

시작 기본값이나 기존 `worktreeId`로 대상을 찾을 수 있지만 작성 시 명시적 경로를
권장합니다. 발견은 선언된 루트와 native Git 등록을 관찰할 뿐 워크트리를 만들거나
테스트를 실행하지 않습니다. 수집 오류는 진단으로 남습니다. 런타임 경계는
[실행](execution.md)을 참고하세요.

## 요청 승인과 Apps

번들 리소스는 `ui://redpact/environment.html`, `ui://redpact/tests.html`입니다.
응답 snapshot을 표시하며 지속 polling·구독을 하지 않습니다. 새 `get_run`이 새
snapshot을 제공합니다. 실행 이력과 리소스 제어는 지속적인 로컬 뷰어에서 확인합니다.

새 `run_tests`는 불변 제출과 인스턴스 `approval` 정책을 캡처합니다.

- `auto`: 즉시 실행을 수락합니다.
- `ask`: `awaiting_approval` 검토 ID를 반환합니다. 환경 승인 후 테스트 묶음을
  승인하며, 두 승인 전에는 컨테이너나 테스트 프로세스를 시작하지 않습니다.

승인은 캡처된 제출·고정 실행 계획·revision·설정 digest에 결합됩니다. 수락과 대기 실행 시 설정을
다시 검증합니다. 나중의 파일 변경은 캡처 테스트를 대체하지 않습니다. 모든 앱 입력의
동결, 충분한 테스트, TDD red나 Git 머지 승인을 입증하지는 않습니다.

App 전용 `review_action`, `set_approval_policy`, `submit_key`는 이를 준수하는
클라이언트에서 모델에 숨겨집니다. 추측 불가능한 capability는 UI 전용 `_meta`로
전달됩니다. Revision 검사로 오래된 작업을 거부하며 중복 최종 승인은 기존 실행을
반환합니다. 기본 정책 변경은 새 요청에만 적용됩니다. Apps가 없는 호스트는 Ask를
텍스트 승인이나 Auto로 몰래 대체할 수 없습니다.

브라우저 번들은 공식 Apps SDK를 사용하며 서버는 기존 SDK로 리소스·도구 메타데이터를
등록합니다. 카드에 에셋을 포함하고 iframe HTTP 대신 host bridge를 사용합니다.
영속 검토 복구는 [저장소](storage.md)에서 설명합니다.

## 자격 증명 입력

`{ "secret": "KEY_NAME" }`를 선언한 후 선택한 연결에 필요한 누락된 이름만 요청합니다.
사용자는 카드나 Project Dependencies에서 직접 입력합니다. 에이전트는 값이 아닌
가용성을 받으며 `submit_key`, HTTP 값 endpoint, 비공개 저장소를 읽어서는 안 됩니다.

입력 capability는 프로젝트와 선언된 이름에 한정되고 30분 후 또는 재시작 시 만료되며
실행을 승인하지 않습니다. 저장하면 카드 입력을 지웁니다. 공개 가용성과 비공개 편집 값은
별도 endpoint입니다. Redaction은 선택한 알려진 값의 텍스트를 다루며 임의로 변환된
출력, 스크린샷, 비디오와 작성 소스를 검사하지 않습니다.

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
