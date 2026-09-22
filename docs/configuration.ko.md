---
title: 프로젝트 설정
description: 관리 서비스, 외부 연결과 테스트 러너가 사용하는 하나의 고정 프로젝트 설정.
---

# 프로젝트 설정

모든 워크트리는 기본 체크아웃의 `.redpact/settings.json`을 사용합니다. 실행 대상으로
선택한 체크아웃에서 Compose 파일, Dockerfile, 앱 소스와 테스트를 읽습니다.
설정을 공유해도 실행 자원은 공유하지 않습니다. 각 실행은 자신의 앱 컨테이너,
의존성 컨테이너와 네트워크를 생성하고 제거합니다.

절대 실행 경로로 `configure describe`를 호출해 생성된 스키마를 확인합니다.
공유 설정을 편집한 다음 같은 경로로 `configure validate`를 호출합니다. 검증은
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
      "env": { "app": { "API_KEY": { "secret": "API_KEY" } } }
    }
  },
  "tests": {
    "directory": "integration",
    "env": { "APP_URL": { "service": "app", "port": 3000, "scheme": "http" } }
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

## 환경변수와 연결

의존성 `env`는 대상 Compose 서비스와 변수 이름으로 구성됩니다. 문자열은 값을
덮어쓰고 생략은 기본값을 유지하며 `{ "unset": true }`는 변수를 제거합니다.
값이 같더라도 두 의존성이 같은 변수에 쓰면 실패합니다. 환경변수 선언은 대상
서비스를 시작하지 않습니다.

`tests.env`는 Integration과 Playwright의 공통 러너 환경입니다. 테스트에 필요한
변수만 선언하며 앱 환경변수는 복사하지 않습니다. 문자열, 비밀값 참조, 관리 서비스
URL을 사용할 수 있습니다. 두 러너는 실행 네트워크의 `<service>.redpact.test` DNS 별칭과 내부 포트로
관리 URL을 해석합니다. 호스트 공개 포트는 별도의 점검용 연결입니다.

인증 정보는 `{ "secret": "KEY_NAME" }`으로 참조하고 프로젝트 인증 정보 컨트롤이나
`request_keys`를 통해 입력합니다. 에이전트에게 인증 값을 보내지 마세요. 프로젝트
값이 서버 값보다 우선하며 명시적인 빈 값은 대체 값을 사용하지 않게 합니다.
실행 텍스트의 비밀값은 마스킹하고 비밀값을 사용하는 브라우저 실행은 trace를
보관하지 않습니다. 소스·스크린샷·영상은 비밀값 검사를 하지 않습니다.

컨테이너 안의 localhost는 그 컨테이너입니다. 호스트 로컬 서비스는 실제로 소비하는
러너와 앱에서 접근 가능해야 합니다. 주소 변경만으로 연결이 검증되지는 않으며,
호스트 loopback에만 바인딩된 서비스에는 접근 가능한 연결 경로가 필요합니다.
원격 연결은 실제 origin, TLS와 인증을 유지합니다. 브라우저에서 API로 접근할 때는
앱의 CORS와 쿠키 규칙도 만족해야 합니다.

## 러너 선언

`tests.directory`의 기본값은 `integration`, `tests.timeoutMs`는 10000입니다.
Unit은 기존 `unitTests`의 Dockerfile, 전체 명령, cwd와 패턴을 사용합니다.
Playwright는 앱 `service`, `port`, 이름 있는 `targets`가 필요하며 purpose는
`functional` 또는 `capture`, scope는 `project` 또는 `worktree`입니다.
브라우저 언어는 `playwright.locale`, 시나리오 UI 언어는 `playwright.uiLanguage`이며
후자는 `REDPACT_UI_LANGUAGE`로 전달됩니다. 실행과 정리는 [실행](execution.md)을 봅니다.

설정은 정규화한 프로젝트 상대 경로를 사용하는 엄격한 JSON입니다. 중복·알 수 없는
키, import, 형식 선택자는 허용하지 않습니다. 빈 설정은 조회용입니다. 관리 앱 실행에는
시작 서비스와 Compose 서비스 설정이 필요합니다.

## 호환되지 않는 설정 변경

모드 카탈로그, 실행 시 선택, Integration 기본값 파일과 워크트리 의존성 overlay는
제거됐습니다. 기존 설정을 고정 시작 서비스와 의존성 정의로 직접 다시 작성해야 합니다.
이전 형식 리더나 자동 마이그레이션은 없습니다. 이전 선택·overlay 파일은 실행 계획에
영향을 주지 않습니다. 파일 소유권과 캡처 입력은 [설정 소유권](settings-reference.md)을 봅니다.

## 인스턴스 설정

Global Settings는 인스턴스를 별도로 제어합니다. `configure describe`는 해당 설정 파일의 위치를 알려줍니다. 인스턴스의 `projects`에는 관찰할 절대 디렉터리를 나열합니다. `server.port`는 다시 시작한 뒤 적용됩니다. 선택적인 `github.cliPath`는 GitHub CLI 실행 파일의 절대 경로를 지정합니다.

실행별 제한은 인스턴스 파일에 둡니다.

```json
{
  "testResources": {
    "memoryMiB": 2048,
    "timeoutSeconds": 600
  }
}
```

생략 시 위 기본값이 이후 관리되는 단위·통합·Playwright 실행에 적용됩니다. 메모리 허용 범위는 64–1048576 MiB, 시간은 1–86400초입니다. 개별 테스트 제한 시간과 별개이며 애플리케이션 컨테이너, 빌드, 셸에서 직접 실행한 테스트 명령을 제한하지 않습니다. [리소스 적용 범위](execution.md)를 참고하세요.
