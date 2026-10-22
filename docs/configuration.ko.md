---
title: 프로젝트 설정
description: 관리 서비스, 외부 연결과 테스트 러너가 사용하는 하나의 고정 프로젝트 설정.
---

# 프로젝트 설정

모든 워크트리는 기본 체크아웃의 `.redpact/settings.json`을 사용합니다. 실행 대상으로
선택한 체크아웃에서 Compose 파일, Dockerfile, 앱 소스와 테스트를 읽습니다.
설정을 공유해도 실행 자원은 공유하지 않습니다. 각 실행은 자신의 앱 컨테이너,
의존성 컨테이너와 네트워크를 생성하고 제거합니다.

`redpact settings describe --scope project --path /absolute/checkout`으로 생성된 스키마를
확인하고 `settings get`으로 작성된 값과 revision을 조회합니다. `settings patch`로 부분
수정한 다음 같은 scope와 경로로 `settings validate`를 실행합니다. 에이전트는 프로젝트나
인스턴스 JSON 파일을 직접 읽거나 편집하지 않습니다. 공유 파일은 저장 형식으로 유지하며,
부분 수정과 복구는 [설정 소유권](settings-reference.md)을 참고하세요. 검증은
고정 실행 계획을 반환하지만 컨테이너를 시작하거나 준비 상태·승인을 입증하지 않습니다.

## 고정 실행 계획

```json
{
  "composeFiles": ["compose.yaml"],
  "services": ["app"],
  "dependencies": {
    "database": { "kind": "isolated", "services": ["db"] },
    "payments": {
      "kind": "mock",
      "services": ["payments"],
      "env": { "app": { "PAYMENTS_URL": "http://payments:8080" } }
    },
    "search": {
      "kind": "shared-local",
      "env": { "app": { "SEARCH_URL": "http://host.docker.internal:9200" } }
    },
    "provider": {
      "kind": "remote",
      "env": { "app": { "API_KEY": "replace-with-your-local-value" } }
    }
  },
  "tests": {
    "directory": "integration",
    "env": { "APP_URL": "http://app.redpact.test:3000" }
  }
}
```

이 예시는 실제 Compose 서비스와 접근 가능한 기존 연결이 있어야 동작합니다.
mock 선언 자체가 대체 구현을 만들지는 않습니다. `services`는 고정 시작 서비스를
선언하며, 관리 의존성 서비스와 Compose 선행 조건이 실행 계획을 완성합니다.
앱 메타데이터와 관계는 토폴로지를 설명할 뿐 추가 서비스를 활성화하지 않습니다.

각 의존성은 `isolated`, `mock`, `shared-local`, `remote` 중 하나의 `kind`를 갖습니다.
isolated는 서비스가 필요합니다. mock은 구현된 앱 동작, 관리 서비스 또는 둘 다를
사용합니다. 외부 연결은 서비스를 선언할 수 없고 Redpact가 시작하거나 제거하지
않습니다. 공유 서비스는 동시 실행 간 테스트 데이터 격리가 필요합니다.

Compose는 실행 정의이며, 설정 검증이 제한된 Compose 부분집합을 강제하지 않습니다.
소유권·런타임 입력 캡처·네이티브 시작 오류 처리는
[Compose와 소스 캡처](execution.md#compose와-소스-캡처)를 참고하세요.

## 환경변수와 연결

의존성 `env`는 대상 Compose 서비스와 변수 이름으로 구성됩니다. 문자열은 값을
덮어쓰고 생략은 기본값을 유지하며 `{ "unset": true }`는 변수를 제거합니다.
값이 같더라도 두 의존성이 같은 변수에 쓰면 실패합니다. 환경변수 선언은 대상
서비스를 시작하지 않습니다.

`tests.env`는 Integration과 Playwright의 공통 러너 환경입니다. 테스트에 필요한
변수만 선언하며 앱 환경변수는 복사하지 않습니다. 모든 값은 평문 문자열입니다.
secret, host, port, URL 값 타입이나 참조 조회, 서버 환경변수 fallback은 없습니다.
URL과 포트도 `"APP_URL": "http://app.redpact.test:3000"`처럼 문자열로 직접 작성합니다.
관리 서비스는 실행 네트워크에서 `<service>.redpact.test` DNS 별칭을 사용하며
호스트 공개 포트는 별도의 점검용 연결입니다.

값은 CLI 설정 패치로 전달하거나 GUI 편집기로 저장합니다.
앱 값은 Dependencies에서, `tests.env`는 프로젝트 설정에서 key와 value 필드로
편집합니다. 별도 인증 정보 저장소, 입력 카드, API는 없습니다. 빈 문자열, 공백,
`=`, `$`는 원문 그대로 유지하며 JSON `\n`은 줄바꿈입니다. dotenv 파싱, 셸 확장,
`.env` 자동 탐색은 하지 않습니다.

비어 있지 않은 모든 앱·테스트 값은 앱 종료 로그를 포함한 실행 텍스트에서
마스킹합니다. 이런 값이 있는 브라우저 실행은 trace를 보관하지 않습니다. 긴
원문부터 일치시켜 치환하므로 짧은 값은 일반 로그 문구도 가릴 수 있습니다.
수락한 실행 설정은 해당 실행의 값을 고정하며 이후 편집은 다음 실행에만 적용됩니다.

값은 설정 파일, 설정 조회 API, 캡처한 설정과 소스에 평문으로 남습니다.
마스킹은 암호화가 아니며 이 기록이나 스크린샷·영상의 값을 제거하지 않습니다.
민감한 설정은 Git이나 공개 내보내기에서 제외하세요.

컨테이너 안의 localhost는 그 컨테이너입니다. 호스트 로컬 서비스는 실제로 소비하는
러너와 앱에서 접근 가능해야 합니다. 주소 변경만으로 연결이 검증되지는 않으며,
호스트 loopback에만 바인딩된 서비스에는 접근 가능한 연결 경로가 필요합니다.
원격 연결은 실제 origin, TLS와 인증을 유지합니다. 브라우저에서 API로 접근할 때는
앱의 CORS와 쿠키 규칙도 만족해야 합니다.

## 러너 선언

`tests.directory`의 기본값은 `integration`, `tests.timeoutMs`는 10000입니다.
허용 범위는 Node 타이머 한계인 1–2147483647밀리초 정수이며, 3분을 뜻하는
180000도 사용할 수 있습니다. Vitest 테스트와 hook의 기본 제한으로 적용되며,
테스트/hook에 명시한 timeout으로 재정의할 수 있습니다. 컨테이너 준비 시간이나
별도 인스턴스 실행 예산은 바꾸지 않습니다. [제한과 판정](execution.md)을 참고하세요.
Unit은 기존 `unitTests`의 Dockerfile, 전체 명령, cwd와 패턴을 사용합니다.
Playwright는 앱 `service`, `port`, 이름 있는 `targets`가 필요하며 purpose는
`functional` 또는 `capture`, scope는 `project` 또는 `worktree`입니다.
브라우저 언어는 `playwright.locale`, 시나리오 UI 언어는 `playwright.uiLanguage`이며
후자는 `REDPACT_UI_LANGUAGE`로 전달됩니다. 실행과 정리는 [실행](execution.md)을 봅니다.

설정은 정규화한 프로젝트 상대 경로를 사용하는 엄격한 JSON입니다. 중복·알 수 없는
키, import, 형식 선택자는 허용하지 않습니다. 빈 설정은 조회용입니다. 관리 앱 실행에는
시작 서비스와 Compose 서비스 설정이 필요합니다.

## 호환되지 않는 설정 변경

비밀값 참조와 타입이 있는 서비스 endpoint도 폐기되었습니다. 작성한 설정에서는
명시적인 문자열로 바꾸세요. 과거 실행 기록에는 순서가 있는 [저장소 마이그레이션](storage.md)을
적용하며 프로젝트 설정은 자동으로 다시 쓰지 않습니다.

모드 카탈로그, 실행 시 선택, Integration 기본값 파일과 워크트리 의존성 overlay는
제거됐습니다. 기존 설정은 CLI 패치로 고정 시작 서비스와 의존성 정의에 맞게 수정해야 합니다.
이전 형식 리더나 자동 마이그레이션은 없습니다. 이전 선택·overlay 파일은 실행 계획에
영향을 주지 않습니다. 파일 소유권과 캡처 입력은 [설정 소유권](settings-reference.md)을 봅니다.

## 인스턴스 설정

Global Settings는 인스턴스를 별도로 제어합니다. `redpact settings describe|get|patch|validate --scope instance`로도 접근할 수 있습니다. 인스턴스의 `projects`에는 관찰할 절대 디렉터리를 나열합니다. `server.port`는 다시 시작한 뒤 적용됩니다. 선택적인 `github.cliPath`는 GitHub CLI 실행 파일의 절대 경로를 지정합니다.

실행별 제한은 인스턴스 설정에 둡니다.

```json
{
  "testResources": {
    "memoryMiB": 2048,
    "timeoutSeconds": 600
  }
}
```

생략 시 위 기본값이 이후 관리되는 단위·통합·Playwright 실행에 적용됩니다. 메모리 허용 범위는 64–1048576 MiB, 시간은 1–86400초입니다. 개별 테스트 제한 시간과 별개이며 애플리케이션 컨테이너, 빌드, 셸에서 직접 실행한 테스트 명령을 제한하지 않습니다. [리소스 적용 범위](execution.md)를 참고하세요.

## 메인 수동 환경의 의존성 호스트 포트

관리 의존성에 `hostPorts`를 선언할 수 있습니다. 예:
`"hostPorts": [{ "service": "langfuse", "target": 3000, "published": 33181 }]`.
서비스는 해당 의존성에 속하고 Compose에서 대상 TCP 포트를 공개해야 합니다.
포트는 1–65535 정수이며 대상 또는 호스트 포트 중복은 잘못된 설정입니다.
설정된 메인 체크아웃의 수동 환경에만 고정 호스트 포트를 적용합니다. 기능 워크트리와
모든 테스트 환경, 고정 선언이 없는 서비스는 자동 공개 포트를 사용합니다. Compose에
작성한 호스트 포트 숫자도 이 정책으로 대체됩니다. 점검 엔드포인트는 실제 Docker
바인딩을 표시합니다. 지정 포트가 점유 중이면 서비스·포트와 해결 방법을 포함해 실패하며
다른 포트로 조용히 대체하지 않습니다.

로컬 클라이언트는 Git에서 제외한 자신의 `.env`나 환경변수에 주소·인증정보를 저장하여
별도 외부 Langfuse에도 연결할 수 있습니다. Redpact는 그 클라이언트 파일을 읽거나
기존 의존성 데이터를 이전하지 않습니다. `shared-local`·`remote` 의존성에는 관리형
호스트 포트를 선언할 수 없습니다.

## 기본 실행 범위

`tests.executionScope`는 Integration만이 아니라 **Unit, Integration, Playwright**가
공유하는 기본값입니다. `all`(생략 시 기본값) 또는 `changed`를 지정하며 실행 요청의
`executionScope`가 우선합니다. 뷰어의 **실행 범위**에서 공유 기본값, 전체 테스트,
변경 테스트를 고릅니다. 파일 카탈로그 필터 및 Playwright 대상의 유지관리 scope와는
별개입니다. [선택 규칙](execution.md)을 확인하세요.

`unitTests.fileCommand`가 없으면 기존 Unit 동작을 유지합니다. `all`은 `command`를
그대로 실행하고 명령이 발견한 정확한 파일 목록을 주장하지 않습니다. `changed`는
아래 명시적 파일 명령 계약이 필요하며 임의 셸 명령을 거부합니다.
파일 명령 카탈로그는 두 범위 모두 Git 체크아웃이 필요합니다. Git이 없는 디렉터리
프로젝트는 기존 `all` 명령을 계속 사용할 수 있습니다.
`fileCommand`를
설정하면 두 범위 모두 실행 파일과 인자 뒤에 정확한 `/workspace/...` 절대 테스트
경로를 전달하며 작업 디렉터리는 `unitTests.cwd`입니다. 실행 파일은 마지막의 파일
인자를 받아 해당 파일만 실행해야 합니다. 이는 명령 문자열 분석이 아닌 작성자가
선택하는 러너 계약입니다. Vitest처럼 파일 필터를 지원하는 러너를 사용하고 인자를
무시하거나 다른 테스트 모음까지 실행하는 스크립트는 피하세요. 인자와 파일명은
셸 코드로 삽입하지 않고 문자 그대로 전달합니다.

```json
{
  "tests": { "executionScope": "all", "env": {} },
  "unitTests": {
    "dockerfile": "unit.Dockerfile",
    "cwd": "app/server",
    "command": "pnpm test",
    "patterns": ["app/server/test/*.test.ts"],
    "fileCommand": { "executable": "pnpm", "args": ["exec", "vitest", "run", "--"] }
  }
}
```

설치·빌드 준비는 Unit 이미지에서 수행하세요. `fileCommand`는 해당 실행의
`command`를 대체하며 기존 셸 명령의 준비 단계를 먼저 실행하지 않습니다.

Git 출력 상한은 서버 환경 변수 `REDPACT_GIT_MAX_BUFFER_MIB`로 설정합니다(기본 128 MiB).
범위, 재시작 및 적용 대상은 [Git 조회 제한](git.md)을 참고하세요. 인스턴스 JSON 필드는 아닙니다.
