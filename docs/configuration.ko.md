---
title: 프로젝트 설정
description: 테스트 실행기, 의존성 모드, 환경 값, 워크트리 선택을 설정합니다.
---

# 프로젝트 설정

Redpact는 기본 체크아웃에 있는 하나의 `.redpact/settings.json`을 사용합니다. 연결된 워크트리는 이 파일을 공유합니다. Compose 파일, Dockerfile, 테스트는 실행 체크아웃에서 해석됩니다. 디렉터리 프로젝트는 두 용도 모두 자신의 루트를 사용합니다.

에이전트에게 `action: "describe"`와 체크아웃의 절대 `path`로 `configure`를 호출하도록 요청하세요. 응답은 공유 설정을 둘 `rulesRoot`와 실행 입력이 있는 `projectRoot`를 알려줍니다. 공유 파일을 편집한 다음 같은 경로와 `action: "validate"`로 `configure`를 호출하세요. 실행 계획을 확인하려면 선택 정보도 포함하세요. 이 호출은 테스트를 시작하거나 서비스 준비 완료를 확인하지 않습니다.

## 최소 설정

다음은 유효한 빈 설정입니다.

```json
{
  "composeFiles": [],
  "dependencies": {}
}
```

이 설정으로 조회할 수 있습니다. 관리되는 통합 테스트와 Playwright 실행에는 Compose 애플리케이션이 필요합니다. 단위 테스트 명령은 Compose 없이 `unitTests`를 사용할 수 있습니다. 프로젝트 연결 시 공유 설정이 없다면 빈 카탈로그와 통합 테스트 기본값으로 생성합니다. 기존 파일은 유효하지 않은 파일도 보존합니다.

`redpact-init`은 연결된 런타임의 스키마에 따라 해당 프로젝트에 적용되는 설정을
채웁니다. 빈 카탈로그, 통합 테스트 기본값, 활성화한 Unit과 Playwright의 모든
기본값 필드를 명시적으로 작성합니다. 필수 서비스, 포트, 명령과 경로에는 실제
프로젝트 값을 사용합니다. 빈 값은 유효한 필드에만 작성하고, 필수 입력이 없는
기능은 미설정 상태로 남겨 보고합니다. 기존 명시 값과 생략된 애플리케이션 환경
바인딩은 보존합니다. 플러그인 설치만으로 프로젝트 init이 실행되거나 연결된
런타임이 업데이트되지는 않습니다.

`uiLanguage`가 거부되면 진단에 표시된 경로를 확인하세요. 이 필드는 프로젝트
최상위나 인스턴스 환경설정이 아니라 `playwright` 아래에 있어야 합니다.
연결된 `configure describe`에 `playwright.uiLanguage`가 없다면 해당 런타임은
현재 계약을 지원하지 않습니다. 해당 필드를 사용하기 전에 올바른 런타임을
업데이트하고 다시 연결해야 합니다. 플러그인만 재설치해도 런타임 스키마 불일치는
해결되지 않습니다.

`compose.yaml`에 TCP 포트 3000을 공개하는 `app` 서비스가 있는 프로젝트의 예시입니다.

```json
{
  "composeFiles": ["compose.yaml"],
  "dependencies": {},
  "tests": {
    "directory": "integration",
    "env": {
      "APP_URL": { "service": "app", "port": 3000, "scheme": "http" }
    }
  }
}
```

서비스가 실제로 존재하고 접근 가능한 인터페이스에서 수신해야 합니다. 테스트는 예시의 `APP_URL` 변수를 명시적으로 읽어야 합니다. Redpact가 준비 중 할당된 호스트 포트를 해석하므로 할당된 포트를 설정에 저장하지 마세요. 이 선언 자체가 독립적으로 실행 가능한 애플리케이션은 아닙니다.

## 필드와 기본값

| 필드 | 용도와 생략 시 기본값 |
| --- | --- |
| `composeFiles` | 순서가 있는 프로젝트 상대 Compose 경로. 기본값 `[]`. |
| `dependencies` | 이름을 키로 하는 의존성 카탈로그. 기본값 `{}`. |
| `applicationServices` | 선택 사항. Compose 서비스에 매핑되는 이름 있는 애플리케이션 노드. |
| `relationships` | 선택 사항. 소스 근거가 있는 작성된 애플리케이션 호출 관계. 설명 용도만 사용. |
| `tests.directory` | Git으로 추적하는 통합 테스트 소스 번들 디렉터리. 기본값 `integration`. Unit 패턴은 이 디렉터리를 포함할 수 없습니다. |
| `tests.timeoutMs` | 개별 통합 테스트·훅 제한 시간. 기본값 10000 ms, 허용 범위 1–60000. |
| `tests.env` | 호스트 통합 테스트 변수. 기본값 `{}`. 문자열, 시크릿 참조, 서비스 URL. |
| `unitTests` | 선택 사항. `dockerfile`, `command`, `patterns` 필수. `cwd` 기본값은 `.`. |
| `playwright` | 선택 사항. 애플리케이션 연결, 이름 있는 브라우저 타깃, 브라우저 설정. |

정규화된 프로젝트 상대 경로를 입력하세요. 검증기는 `./`, `..`, 절대 경로, 역슬래시를 자동 수정하지 않고 거부합니다. `unitTests.cwd`는 예외적으로 `.`도 허용합니다. 알 수 없는 필드와 중복 JSON 키는 오류입니다. 편집할 때 생략된 기본값을 유지하세요. 다른 형식, 설정 버전 선택기, 연결된 워크트리별 덮어쓰기는 없습니다.

단위 테스트 명령은 선택한 체크아웃에서 빌드한 임시 컨테이너에서 실행됩니다. Dockerfile은 `/workspace`, 의존성, `/bin/sh`를 제공하고 `cwd`는 `/workspace` 아래 디렉터리를 선택합니다. 종료되는 명령을 사용하세요. 패턴은 파일 탐색을 제어하고 명령이 실제 실행 대상을 정합니다. [단위 테스트 명령](execution.md)을 참고하세요.

Playwright에는 `service`, `port`, 비어 있지 않은 `targets` 맵이 필요합니다. 각 타깃에는 `purpose`(`capture` 또는 `functional`), `testMatch` 패턴, `scope`(기본값 `project` 또는 `worktree`)가 있습니다. 기본값은 `directory: "ui-tests"`, HTTP, 1920 × 1080, `en-US`, UTC, 밝은 테마, 동영상 없음, 테스트 제한 시간 30000 ms입니다. 범위는 목적과 독립적으로 유지 수명을 제어합니다. [Playwright 설정](execution.md)을 참고하세요.

## 의존성 모드

각 의존성은 `modes` 아래에 실행 가능한 정의를 선언합니다.

| 모드 | 의미 |
| --- | --- |
| `isolated` | 실제 의존성 Compose 서비스를 실행합니다. 비어 있지 않은 `services`가 필요합니다. |
| `mock` | 애플리케이션 코드에 구현된 대체 동작이나 모의 서버를 사용합니다. 서비스, 덮어쓰기 또는 둘 다 추가할 수 있습니다. |
| `shared-local` | 이미 실행 중인 로컬 공용 서비스에 연결하며 `services`를 선언할 수 없습니다. |
| `remote` | 기존 실제 API에 연결합니다. 서비스를 선언할 수 없습니다. |

모드 플래그가 모의 동작을 구현해 주지는 않습니다. 샌드박스와 스테이징 엔드포인트는 새로운 모드 이름이 아닌 `remote`에 속합니다. `assessments`는 사용할 수 없거나 미완성인 옵션을 설명할 수 있습니다. `recommendation`은 모드를 선택하지 않습니다.

`dependencies.payments`의 의존성 정의 예시입니다.

```json
{
  "modes": {
    "remote": {
      "env": {
        "app": {
          "PAYMENTS_URL": "https://payments.example.com",
          "PAYMENTS_API_KEY": { "secret": "PAYMENTS_API_KEY" }
        }
      }
    }
  }
}
```

이 블록은 전체 설정 파일이 아닌 의존성 정의입니다. 예시 엔드포인트와 변수를 애플리케이션의 계약에 맞게 바꾸세요. 모드의 `env`는 대상 Compose 서비스를 키로, 그 아래 변수를 키로 사용합니다. 생략한 `services`와 `env`의 기본값은 `[]`와 `{}`입니다. 덮어쓰기는 대상 서비스를 활성화하지 않습니다. 해당 서비스가 선택한 계획에서 활성화되어 있어야 합니다.

## 환경 값과 시크릿

문자열은 컨테이너 변수를 대체합니다. 생략하면 기본값을 보존합니다. `{ "unset": true }`는 명시적으로 제거합니다. 선택한 두 모드가 같은 서비스 변수를 수정하면 값이 같더라도 충돌합니다.

민감한 값에는 `{ "secret": "KEY_NAME" }`을 사용하세요. 에이전트가 참조를 선언하면 Project Dependencies에서 직접 값을 입력하거나 연결된 클라이언트가 지원하는 자격 증명 카드에서 입력하세요. 일반 문자열은 변수 이름이 `TOKEN`이나 `PASSWORD`여도 그대로 보입니다.

프로젝트 시크릿 값은 해당 인스턴스의 프로젝트 워크트리 전체에서 공유됩니다. 같은 이름의 서버 환경 값보다 우선하며 명시적으로 저장한 빈 값은 대체 값 사용을 막습니다. 값 교체는 새 환경에 적용됩니다. 기존 환경은 비공개로 수집한 값을 유지합니다. 선택된 시크릿 값은 실행 텍스트에서 가려지며 시크릿을 포함하는 Playwright 실행은 trace 아카이브를 생략합니다. 이미지, 동영상, 작성된 소스에서 자격 증명을 검사하지는 않습니다.

`tests.env`는 문자열, 시크릿 참조, 서비스 URL을 지원합니다. 컨테이너의 `{ "unset": true }` 바인딩은 여기서 지원하지 않습니다. 컨테이너 간 URL은 `http://payments:8080` 같은 일반 Compose 네트워크 주소를 사용합니다.

## 워크트리 선택

카탈로그는 사용 가능한 모드를 설명합니다. 실행 체크아웃의 `.redpact/selection.json`이 루트 서비스와 각 의존성의 모드 하나를 선택합니다.

```json
{
  "services": ["app"],
  "select": { "payments": "remote" }
}
```

의존성이 없으면 `"select": {}`를 사용하세요. 워크트리 Environment 화면을 사용하거나 `run_tests`에 `selection`을 제공하세요. 수락된 새 환경 요청은 선택을 기억합니다. 생략하면 저장된 선택을 사용하며 저장된 값이 없는 첫 요청에는 선택이 필요합니다. 저장된 선택이 유효하지 않으면 임의로 대체하지 않고 실패합니다.

활성 서비스는 루트, 선택한 모드의 서비스, 고정된 Compose `depends_on` 선행 서비스입니다. 모의 모드에서 제외되어야 하는 의존성을 무조건적인 선행 조건으로 두지 마세요. 선택 저장은 아무것도 시작하지 않습니다. 실행마다 새 임시 환경을 만듭니다. 공용 로컬 인프라는 shared-local 모드로 연결하며 Redpact가 수명을 관리하지 않습니다.

## 전체 예시: 결제 mock을 사용하는 애플리케이션

다음은 `compose.yaml`에 3000 포트로 수신하고 해당 TCP 포트를 공개하는 `app` 서비스가 있으며, 애플리케이션이 `PAYMENTS_MODE=mock`을 구현했다고 가정한 전체 설정입니다. 해당 애플리케이션 계약에 맞춘 템플릿입니다. 함께 제공되는 실행 가능한 예제는 [Order Desk 따라 하기](first-run.md)를 참고하세요.

```json
{
  "composeFiles": ["compose.yaml"],
  "dependencies": {
    "payments": {
      "modes": {
        "mock": {
          "env": {
            "app": { "PAYMENTS_MODE": "mock" }
          }
        }
      }
    }
  },
  "tests": {
    "directory": "integration",
    "env": {
      "APP_URL": { "service": "app", "port": 3000, "scheme": "http" }
    }
  },
  "playwright": {
    "service": "app",
    "port": 3000,
    "directory": "ui-tests",
    "locale": "en-US",
    "uiLanguage": "en",
    "targets": {
      "project-captures": {
        "scope": "project",
        "purpose": "capture",
        "testMatch": ["project/captures/**/*.ts"]
      },
      "project-tests": {
        "scope": "project",
        "purpose": "functional",
        "testMatch": ["project/tests/**/*.ts"]
      }
    }
  }
}
```

`services: ["app"]`, `select: { "payments": "mock" }`을 선택합니다. 애플리케이션에는 `PAYMENTS_MODE=mock`이 전달됩니다. 호스트의 Integration 테스트에는 할당된 애플리케이션 주소가 `APP_URL`로 전달됩니다. Playwright는 설정한 애플리케이션 서비스와 포트로 상대 경로에 접근하며 `tests.env`를 상속하지 않습니다.

### Playwright UI 언어

`playwright.locale`은 Chromium 브라우저 locale을 설정합니다. `playwright.uiLanguage`는
애플리케이션 Playwright UI 라벨에 쓰는 두 글자 또는 세 글자 언어이며 기본값은 `en`입니다.
모든 시나리오에는 `REDPACT_UI_LANGUAGE`로 전달됩니다. 단일 언어 앱은 예를 들어
`"ko-KR"`과 함께 `"ko"`를 명시하세요. 시나리오 헬퍼는 `page.goto` 전에 이 값으로
애플리케이션을 초기화하고 같은 언어의 locator를 사용해야 합니다. 애플리케이션은 브라우저
환경설정, 저장소, cookie, URL 라우팅을 쓰거나 다국어를 전혀 지원하지 않을 수 있으므로
브라우저 locale에서 UI 라벨을 추론하지 마세요.

이 예시를 적용할 때는 Compose 경로, 서비스명, 포트, 애플리케이션 변수, 테스트 경로를 함께 맞추세요. 브라우저 실행이 필요하지 않다면 Playwright 블록을 제거하세요. 실제 코드나 존재하는 서비스가 지원하는 의존성 모드만 추가한 뒤 의도한 체크아웃과 선택을 검증하세요.

## 값을 어디에 넣어야 하나요?

| 값 | 넣을 곳 | 예시 |
|---|---|---|
| 애플리케이션의 일반 시작 기본값 | Compose 또는 애플리케이션 이미지 | 기본 로그 수준 |
| 선택한 의존성이 컨테이너에 적용할 값 | `dependencies.<name>.modes.<mode>.env.<service>` | `app`의 `PAYMENTS_MODE` |
| 호스트 Integration 테스트가 사용할 URL | `tests.env` 서비스 바인딩 | `app:3000`에서 매핑한 `APP_URL` |
| 브라우저 애플리케이션 진입점 | `playwright.service`와 `playwright.port` | 상대 경로 `page.goto` 요청 |
| 브라우저 UI 라벨 언어 | `playwright.uiLanguage` | 한국어 앱 locator용 `ko` |
| 이 체크아웃에서 선택할 서비스와 모드 | `.redpact/selection.json` | `payments: mock` |
| 실행 메모리와 전체 시간 예산 | 인스턴스 `testResources` | 2048 MiB와 600초 |

컨테이너 안에서 `localhost`는 그 컨테이너 자신을 가리킵니다. 다른 컨테이너에는 `http://payments:8080`처럼 의존성의 Compose 이름으로 접근하세요. 호스트 Integration 테스트에는 서비스 바인딩이 제공하는 공개 포트 매핑이 필요합니다. 호출 위치가 다르므로 이 주소들을 서로 바꿔 쓸 수 없습니다.

## 모드를 바꿀 때 이전 기본값 확인하기

변수를 생략하면 기존 값이 유지됩니다. Compose에 실제 제공자 URL이 정의돼 있다면 mock 모드를 선택해도 그 URL이 자동으로 제거되지 않습니다. mock 구현이 무시하거나 모드에서 명시적으로 덮어쓰거나 해제하지 않는 한 애플리케이션이 계속 사용할 수 있습니다.

mock 모드에서 없어야 하는 변수라면 해당 컨테이너 변수 바인딩에 `{ "unset": true }`를 넣으세요. 실행 계획을 검증하고 어떤 변수를 덮어쓰거나 제거하는지 확인하세요. 선택한 두 의존성이 같은 서비스 변수를 변경한다면 설정에서 소유 관계를 정리해야 합니다. 선택 순서로 우선순위를 결정하지 않습니다.

설정이나 애플리케이션 입력을 바꾼 뒤에는 새 테스트를 실행해 임시 환경을 준비하세요. 기존 환경은 시작 당시 구성을 보존합니다. 저장이나 검증이 성공해도 실행 중인 프로세스가 업데이트되지는 않습니다.

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

## 에이전트 도구

| 도구 | 입력과 역할 |
| --- | --- |
| `configure` | `action: "describe"`, `"inspect"`, `"validate"` 중 하나, 체크아웃의 절대 `path`. `selection`은 `inspect`와 `validate`에만 허용되며 저장된 선택을 자동으로 읽지 않습니다. 스키마, 설정, 진단, 계획을 읽습니다. |
| `run_tests` | 절대 `path`, 선택적인 `tests.directory` 기준 정확한 `tests` 경로, `selection` 또는 저장된 워크트리 선택. 관리되는 통합 테스트 실행을 시작합니다. |
| `get_run` | 반환된 `id`. 상태, 결과, 환경 정리 상태를 읽습니다. |
| `request_keys` | 관찰된 `projectId`와 선언된 누락 자격 증명의 `names`. 사용 가능 여부를 반환하고 지원되는 경우 사용자에게 직접 입력을 요청합니다. |

MCP `run_tests`는 단위 테스트 명령이나 Playwright 타깃을 실행하지 않습니다. 해당 뷰어 컨트롤이나 HTTP를 사용하세요. 조기 취소와 정리 재시도는 사용자 웹 컨트롤에서 수행합니다. [전체 설정 계약](configuration.md)과 [설정 소유권](settings-reference.md)을 참고하세요.

## 고급 소유권

기본·워크트리 파일 해석, 의존성 한정 override, 프로젝트 Integration 기본 선택과 검토된 승격은 [설정 소유권](settings-reference.md)을 참고하세요. 수동 Container 수명과 정리는 [실행](execution.md)을 참고하세요.
