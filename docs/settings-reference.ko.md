---
title: 설정 소유권
description: 공유 설정 파일의 소유권, 검증과 변경 불가능한 실행 입력을 설명합니다.
---

# 설정 소유권

고정 의존성 정의, 환경 바인딩 의미와 예제는 [설정 가이드](configuration.md)가 소유합니다.
이 문서는 파일 위치, 수정 수락 규칙과 실행 시 공유 설정을 캡처하는 절차를 정의합니다.
정확한 스키마는 실제 실행 체크아웃으로 `redpact settings describe --scope project`를 호출해 확인하세요.
API 스키마는 별도 목록을 복사하지 않고 구현에서 생성합니다.

## 파일과 경로 해석

`<rulesRoot>/.redpact/settings.json`이 유일한 고정 프로젝트 설정입니다.
`rulesRoot`는 기본 프로젝트 디렉터리이고 `projectRoot`는 선택한 실행 체크아웃입니다.
Compose, Dockerfile, 앱과 테스트 경로는 실행 체크아웃에서 해석합니다.
체크아웃의 로컬 settings 파일은 공유 설정을 대체하지 않습니다.

추적 설정은 `<rulesRoot>/.redpact/tracking.json`에 남습니다. 관찰·승인·자원 한도는
데이터 디렉터리의 인스턴스 설정이 소유합니다. 모드 선택, Integration 기본값과
의존성 overlay 파일은 더 이상 읽지 않습니다. 승격 단계와 이전 형식 리더도 없습니다.
기존 프로젝트는 CLI 설정 패치로 현재 [설정 계약](configuration.md)에 맞춰 수정해야 합니다.

CLI, HTTP, MCP와 실행은 동일한 검증을 사용합니다. 알 수 없는 필드, 중복 키, 안전하지
않은 경로, 충돌하는 변수 쓰기와 크기 제한 위반을 거부합니다. 수락된 실행은 공유
설정 소스와 해시를 실행 체크아웃의 소스 식별값과 별도로 캡처합니다. 이후 수정은
새 실행에만 적용됩니다.

설정 저장과 검증은 코드를 시작하거나 실행을 승인하지 않습니다. 각 실행은 새로운
자원을 소유하며 다른 실행의 컨테이너·네트워크·인증 정보 스냅샷을 재사용하지 않습니다.

런타임 스냅샷 변환은 작성한 프로젝트 설정과 별개입니다. [버전별 시작 마이그레이션](storage.md)을
참고하세요. 첫 마이그레이션은 인스턴스 설정을 보존하고 구형 환경 기록의 캡처된 선택만 사용합니다.

Compose 서비스 참조는 비어 있지 않은 문자열이며 Redpact의 소문자 식별자 규칙을
강제하지 않습니다. 서비스 이름 구문은 Compose가 처리하며 의존성·Playwright 대상
식별자는 기존 설정 스키마를 유지합니다. 설정 검증과 Compose 실행 동작의 구분은
[실행](execution.md#compose와-소스-캡처)을 참고하세요.

## CLI 설정 접근

에이전트는 프로젝트와 인스턴스 설정 모두 `redpact settings`로 접근합니다. 저장용 JSON
파일을 직접 읽거나 편집하지 않습니다. 이는 지원되는 접근 계약이며 신뢰된 로컬 프로세스의
파일 접근을 차단하는 보안 경계는 아닙니다. 일반 애플리케이션 소스와 Git 작업은 기존 파일
도구와 네이티브 `git`을 사용합니다.

`--server URL` 또는 `REDPACT_SERVER_URL`로 연결된 인스턴스를 명시하세요.
공유 프로젝트 설정은 `--scope project --path /absolute/checkout`, 전역 설정은
`--scope instance`를 사용합니다. 조회만으로 파일을 생성하거나 프로젝트를 연결하지 않습니다.
프로젝트 경로는 실행 체크아웃을 선택하며 공유 설정은 여전히 기본 체크아웃이 소유합니다.
워크트리별 overlay는 추가하지 않습니다.

```sh
redpact settings describe --scope project --path /absolute/checkout --json
redpact settings get --scope project --path /absolute/checkout --pointer /tests --json
redpact settings patch --scope project --path /absolute/checkout \
  --revision RETURNED_REVISION \
  --patch '[{"op":"add","path":"/tests/timeoutMs","value":180000}]' --json
redpact settings validate --scope project --path /absolute/checkout --json
```

`describe`는 실행 중인 서버의 스키마와 소유권 정보를 제공합니다. `get`은 기본값을 삽입하지
않은 작성값, 진단과 전체 문서 revision을 반환합니다. `--pointer`로 일부만 조회해도 revision은
전체 문서 기준입니다. 문서가 없으면 `exists: false`, `revision: null`, `value: null`입니다.
이때만 `--revision` 대신 `patch --create`를 사용합니다. 오래된 revision으로 실패한 쓰기를
자동 재시도하지 말고 현재 revision을 조회한 뒤 의도한 변경을 조정하세요.

`patch`는 JSON Patch의 `add`, `replace`, `remove`, `test`를 지원합니다.
경로는 JSON Pointer를 사용합니다(`~`는 `~0`, `/`는 `~1`). 빈 포인터는 루트입니다.
없는 부모 객체는 자동 생성하지 않습니다. 필요하면 같은 작업 배열 안에서 부모와 자식을
순서대로 생성하세요. 배열은 표준 인덱스와 추가 의미를 따르며 `null`, 필드 삭제, 값 보존은
서로 다릅니다. 모든 작업은 하나의 필수 revision 또는 명시적 생성 조건 아래 메모리에 적용됩니다.
서버는 전체 후보 설정과 프로젝트 실행 계획을 검증한 뒤 한 번에 원자적으로 저장합니다.
작업·검증·revision 실패는 원본을 변경하지 않습니다. 건드리지 않은 값은 보존하며 공백 형식은
정규화할 수 있습니다. 셸 인수에 값을 남기지 않으려면 `--patch` 대신 `--patch-stdin`을 사용하세요.

인스턴스 패치는 루트 교체를 포함해 승인 정책과 Git/GitHub 소유 설정을 변경할 수 없습니다.
저장은 실행·승인·기존 요청 입력 교체를 수행하지 않습니다. 포트 변경은 재시작이 필요합니다.
설정 응답은 `redaction: "none"`을 명시하며 평문 인증 값이 포함될 수 있습니다. 필요한 하위
구조만 읽고 비공개 값을 대화나 공개 증거에 복사하지 마세요.

JSON 구문이 잘못되거나 키가 중복되면 `get`은 `value: null`과 진단을 반환하며
의미 기반 패치를 적용할 수 없습니다. revision과 진단을 조회한 뒤
`redpact settings repair --scope project --path /absolute/checkout
--revision RETURNED_REVISION --document-stdin`에 유효한 전체 대체 객체를 stdin으로 전달하세요.
서버는 교체 전에 원본 백업을 보존합니다. repair는 JSON 구문 오류나 중복 키에만 사용하며 유효한 JSON의
필드 오류는 `patch`로 수정합니다. 별도 형식이나 자동 마이그레이션을 추가하거나 CLI를 우회해
파일을 직접 수정하는 절차가 아닙니다.

인스턴스의 잘못된 JSON도 `--scope instance`로 복구할 수 있지만 대체 객체는
`approval: "ask"`를 명시하고 `github` 필드를 포함하지 않아야 합니다. 손상된 문서의
기존 승인 정책을 추정하지 않습니다. 백업 이름은 원본 이름 뒤 `.repair-REVISION.bak`이며
접근 권한은 600입니다. 재시도 시 같은 원본의 백업만 재사용하고 다른 백업과 충돌하면 중단합니다.

## 편집기와 표시 설정

Project settings는 의존성을 보존하면서 앱·테스트 필드를 편집합니다. Dependencies는
고정 정의와 환경 값을 소유합니다. 읽기는 source, revision, 해석한 값과 진단을 반환합니다.
저장은 revision 충돌을 검사하고 검증 후 원자적으로 교체합니다. 구문이 잘못된 프로젝트 JSON은 CLI의 revision 기반
`settings repair`로 복구해야 합니다. 외부 편집을 관찰해도 열린 초안을 몰래 대체하지 않습니다.

`playwright.locale`은 Chromium 설정이고 `playwright.uiLanguage`는 Playwright 시나리오의
UI 라벨에 쓰는 선언된 언어입니다. runner는 후자를 `REDPACT_UI_LANGUAGE`로 전달합니다.
애플리케이션별 테스트 헬퍼는 이동 전에 이 값으로 저장소, cookie 또는 route를 초기화합니다.
따라서 모든 앱이 브라우저 locale을 따른다고 가정하지 않고 단일 언어 앱의 locator 언어를
명시할 수 있습니다.

Tracking에는 `mainBranch`, `hideMerged`, 선택적 `showBranches`가 저장됩니다.
사이드바 Worktrees는 표시를, Project settings는 메인 브랜치를 제어합니다.
테마·언어·줄바꿈·프로젝트 메뉴 숨김은 브라우저 표시 설정입니다. 저장소 설정이 아니며
브라우저 저장이 막혀도 현재 세션에서 사용할 수 있습니다.

포트 변경은 재시작이 필요합니다. GitHub CLI와 리소스 설정은 이후 작업에 적용됩니다.
미래 기본값이 바뀌어도 수락된 실행, 대기 중 검토와 기존 환경은 캡처한 값을 유지합니다.

구현: [설정 스키마](../app/server/src/core/settings-schema.ts),
[configure 안내](../app/server/src/workflows/configure.ts),
[설정 reader](../app/server/src/adapters/settings/json.ts).

인스턴스 설정은 선택적으로 `agents.codex.cliPath`와 `agents.claude.cliPath`에 절대 실행 파일 경로를 저장합니다. 경로를 생략하면 자동 탐지합니다. 저장만으로 CLI를 실행하지 않으며 다음 플러그인 확인에 저장값을 적용합니다. 지원 출처와 업데이트 동작은 [에이전트 플러그인 업데이트](installation.md)를 참고하세요. 선택 필드이므로 기존 인스턴스 설정을 다시 작성할 필요가 없습니다.
