---
title: 설정 소유권
description: 공유 설정 파일의 소유권, 검증과 변경 불가능한 실행 입력을 설명합니다.
---

# 설정 소유권

고정 의존성 정의, 환경 바인딩 의미와 예제는 [설정 가이드](configuration.md)가 소유합니다.
이 문서는 파일 위치, 수정 수락 규칙과 실행 시 공유 설정을 캡처하는 절차를 정의합니다.
정확한 스키마는 실제 실행 체크아웃으로 `configure describe`를 호출해 확인하세요.
API 스키마는 별도 목록을 복사하지 않고 구현에서 생성합니다.

## 파일과 경로 해석

`<rulesRoot>/.redpact/settings.json`이 유일한 고정 프로젝트 설정입니다.
`rulesRoot`는 기본 프로젝트 디렉터리이고 `projectRoot`는 선택한 실행 체크아웃입니다.
Compose, Dockerfile, 앱과 테스트 경로는 실행 체크아웃에서 해석합니다.
체크아웃의 로컬 settings 파일은 공유 설정을 대체하지 않습니다.

추적 설정은 `<rulesRoot>/.redpact/tracking.json`에 남습니다. 관찰·승인·자원 한도는
데이터 디렉터리의 인스턴스 설정이 소유합니다. 모드 선택, Integration 기본값과
의존성 overlay 파일은 더 이상 읽지 않습니다. 승격 단계와 이전 형식 리더도 없습니다.
기존 프로젝트는 현재 [설정 계약](configuration.md)에 맞춰 직접 설정해야 합니다.

HTTP, MCP와 실행은 동일한 검증을 사용합니다. 알 수 없는 필드, 중복 키, 안전하지
않은 경로, 충돌하는 변수 쓰기와 크기 제한 위반을 거부합니다. 수락된 실행은 공유
설정 소스와 해시를 실행 체크아웃의 소스 식별값과 별도로 캡처합니다. 이후 수정은
새 실행에만 적용됩니다.

설정 저장과 검증은 코드를 시작하거나 실행을 승인하지 않습니다. 각 실행은 새로운
자원을 소유하며 다른 실행의 컨테이너·네트워크·인증 정보 스냅샷을 재사용하지 않습니다.

런타임 스냅샷 변환은 작성한 프로젝트 설정과 별개입니다. [버전별 시작 마이그레이션](storage.md)을
참고하세요. 첫 마이그레이션은 인스턴스 설정을 보존하고 구형 환경 기록의 캡처된 선택만 사용합니다.

## 편집기와 표시 설정

Project settings는 의존성을 보존하면서 앱·테스트 필드를 편집합니다. Dependencies는
고정 정의와 환경 값을 소유합니다. 읽기는 source, revision, 해석한 값과 진단을 반환합니다.
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
