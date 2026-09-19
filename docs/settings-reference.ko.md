---
title: 설정 소유권
description: 설정 파일의 소유 범위, 한정 override, 검증과 검토된 승격을 설명합니다.
---

# 설정 소유권

의존성 모드, 환경 바인딩 의미와 예제는 [설정 가이드](configuration.md)가 소유합니다.
이 문서는 파일 위치, 수정 수락 규칙과 워크트리 설정을 공유하는 절차를 정의합니다.
정확한 스키마는 실제 실행 체크아웃으로 `configure describe`를 호출해 확인하세요.
API 스키마는 별도 목록을 복사하지 않고 구현에서 생성합니다.

## 파일과 경로 해석

| 파일 | 소유자와 목적 |
| --- | --- |
| `<rulesRoot>/.redpact/settings.json` | 공유 Compose, 의존성, Unit, Integration, Playwright 선언 |
| `<projectRoot>/.redpact/dependencies.override.json` | 연결된 워크트리 실행 전용 한정 overlay. 기본 체크아웃 실행에는 미적용 |
| `<projectRoot>/.redpact/selection.json` | 해당 체크아웃의 다음 실행에 사용할 루트 서비스와 의존성 선택 |
| `<rulesRoot>/.redpact/integration-defaults.json` | 프로젝트 Integration과 수동 Container 기본 선택 |
| `<rulesRoot>/.redpact/tracking.json` | 메인 브랜치, 머지 항목 숨기기와 브랜치 표시 설정 |
| `<data-dir>/settings.json` | 인스턴스 포트, 관찰 프로젝트, 승인, GitHub CLI, 실행 제한 |

`rulesRoot`는 기본 프로젝트 디렉터리이며 `projectRoot`는 선택한 실행 체크아웃의
프로젝트 디렉터리입니다. Compose, Dockerfile과 테스트 경로는 실행 체크아웃에서
해석합니다. 체크아웃 로컬 `settings.json`은 공유 규칙을 대체하지 않습니다.
프로젝트 형식은 하나이며 import, 형식 선택기와 마이그레이션은 없습니다.

명시적 실행 선택은 저장된 워크트리 선택보다 우선합니다. 최초 선택이 없으면 입력이
필요하고, 잘못된 저장 선택은 자동 대체하지 않고 실패합니다. `configure inspect/validate`는
제공된 선택만 사용하며 저장 선택을 읽지 않습니다. 설정이나 선택 저장은 실행이나 승인이 아닙니다.

프로젝트 Integration 기본 선택 파일이 없으면 선언된 모드 중 `mock`, `isolated`,
`shared-local`, `remote` 순서로 선택합니다. 애플리케이션 메타데이터가 루트 서비스를
정하며, 없으면 의존성 모드가 소유하지 않는 Compose 서비스를 사용합니다.
이 과정이 모의를 구현하거나 평가 항목을 실행 가능한 모드로 승격하지는 않습니다.

## 의존성 한정 override

연결된 워크트리는 다음 필드만 덮어쓸 수 있습니다.

| 필드 | 대체 방식 |
| --- | --- |
| `dependencies` | 이름별 의존성을 완전히 대체하고 나머지는 상속 |
| `applicationServices` | 이름별 애플리케이션을 대체하고 나머지는 상속 |
| `composeFiles` | 순서가 있는 전체 목록 대체 |
| `relationships` | 전체 목록 대체 |
| `testEnv` | 이름별 `tests.env` 바인딩 대체. 다른 테스트 설정은 상속 |

삭제 표식이나 임의 설정 override는 없습니다. 모드를 추가할 때는 그 의존성에 계속
필요한 다른 모드도 함께 작성해야 합니다. 중첩 환경 맵을 재귀적으로 병합하지 않습니다.
`composeFiles`를 대체하면 여전히 필요한 공유 파일도 포함하세요. 대응하는 앱·모의·Compose
변경을 같은 체크아웃에서 구현해야 합니다.

HTTP, MCP, Unit, Integration, Playwright는 같은 유효 설정 reader를 사용합니다.
잘못된 overlay는 실패하며 fallback으로 숨기지 않습니다. 중복 키, 알 수 없는 필드,
위험한 경로, 선택된 변수 충돌과 소스 크기 제한을 검사합니다. 유효 digest에는 기본
설정과 override 소스 hash가 포함됩니다. 검증은 구조와 일관성을 확인하며 Docker,
자격 증명이나 애플리케이션 준비 완료를 입증하지 않습니다.

## 검토와 승격

유효한 활성 overlay에 대해 `configure inspect`는 `promotion`을 반환합니다.
기본 설정 `file`, 전체 유효 `source`, `baseSha256`, `overrideSha256`을 가진 읽기 전용
후보입니다. 테스트와 테스트 승인으로 설정이 승격되지는 않습니다.

승인된 머지 시 다음을 수행합니다.

1. 대상과 동기화한 후 두 hash를 다시 확인하고 Compose·모의 구현과 의존성 변경을
   함께 검토합니다. 입력이 바뀌었으면 새 검증이 필요합니다.
2. 구현 파일을 머지합니다. 작업 overlay는 머지 커밋 밖의 로컬에 두고 승격 전까지 보존합니다.
3. `GET /api/projects/:id/configuration`의 revision이 `baseSha256`과 같은지 확인합니다.
   `{ source, revision }`으로 `PUT` 저장합니다. 충돌 시 강제 덮어쓰기 대신 다시 검토합니다.
4. 의도한 선택으로 기본 체크아웃과 연결된 워크트리의 실제 앱을 검증합니다.
   승격 후에만 검토된 내용 그대로인 overlay를 제거합니다. 공유 설정이 추적 파일이면
   커밋하고, 아니면 로컬 범위임을 보고합니다.

Git 머지와 설정 승격은 별개이며 트랜잭션이 아닙니다. 실패 시 overlay를 보존하고
미완료 승격을 보고합니다. 로컬 실험은 명시적으로 미승격 상태에 둘 수 있습니다.
다른 워크트리도 새 공유 모드를 선택하기 전에 머지된 구현이 필요합니다.

## 편집기와 표시 설정

Project settings는 의존성을 보존하면서 앱·테스트 필드를 편집합니다. Dependencies는
모드와 환경 값을 소유합니다. 읽기는 source, revision, 해석한 값과 진단을 반환합니다.
저장은 revision 충돌을 검사하고 검증 후 원자적으로 교체합니다. 잘못된 JSON은 지정된
파일을 복구해야 합니다. 외부 편집을 관찰해도 열린 초안을 몰래 대체하지 않습니다.

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
