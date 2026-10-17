---
title: 첫 프로젝트 설정
description: 체크아웃을 연결하고 공통 설정을 작성한 뒤 고정 환경 구성을 검증합니다.
---

# 첫 프로젝트 설정

먼저 [Redpact 인스턴스와 MCP 연결](installation.md)을 준비하세요. 테스트할 애플리케이션의 실제 체크아웃을 선택합니다. Redpact는 Git 저장소와 디렉터리 프로젝트를 지원합니다. 워크트리는 애플리케이션과 테스트 파일을 실행할 구체적인 체크아웃을 가리킵니다.

## 디렉터리 연결

뷰어의 프로젝트 연결 양식에 애플리케이션의 절대 경로를 입력하거나, 서버를 시작할 때 `--project /absolute/path/to/your-project`를 지정하세요. 연결된 Git 프로젝트는 기존 워크트리를 자동으로 찾습니다. 탐색만으로 브랜치를 생성하거나 테스트를 실행하지는 않습니다.

연결이 필요하면 에이전트는 `redpact projects connect --path /absolute/checkout`을 사용하고
이후 CLI 작업에도 같은 `--path`를 전달합니다. GUI 선택은 CLI 대상을 바꾸지 않습니다.
체크아웃과 브랜치 작업은 네이티브 Git을 사용합니다.

기존 체크아웃을 연결해도 작성한 설정을 보존하며 없는 `.redpact/settings.json`을 만들지 않습니다. 발견이나 tracking 조회는 파일을 초기화·수정하지 않습니다. CLI 설정 패치와 검증을 사용하세요. 에이전트는 설정 JSON을 직접 읽거나 수정하지 않습니다.

## 에이전트에게 애플리케이션 조사 요청

다음처럼 요청하세요.

> 이 프로젝트에 Redpact 관리형 통합 테스트를 설정해줘. 이 체크아웃에 redpact settings describe --scope project를 호출하고 실제 빌드·시작 명령, 의존성, Docker 파일을 확인한 뒤 settings get과 revision 기반 settings patch로 프로젝트 설정을 수정해줘. 기존 설정은 보존해줘. 사용할 서비스와 고정 의존성 구성을 검증하고, 실행 시 추가로 확인해야 할 사항을 알려줘. 아직 테스트는 시작하지 마.

에이전트는 애플리케이션을 실행하는 Compose 서비스, 사용하는 의존성, 테스트에 필요한 연결 값을 파악해야 합니다. Docker 또는 Compose 파일이 없다면 실제 애플리케이션 동작을 바탕으로 작성해야 합니다. mock 의존성을 선언하는 것만으로 mock 구현이 생기지는 않습니다.

단위 테스트만 설정하려면 단위 테스트용 Dockerfile과 명령을 요청하세요. `redpact tests run --kind integration`은 관리형 Vitest 통합 테스트를 실행합니다. 단위 테스트는 `--kind unit`, Playwright는 `--kind playwright --target TARGET`을 사용합니다. [테스트 종류와 작성 방법](tests.md)을 참고하세요.

## 고정 실행 구성 정의

기본 체크아웃의 `.redpact/settings.json`을 사용하며 `redpact settings describe --scope project --path /absolute/checkout`이 `rulesRoot`를
알려줍니다. 모든 워크트리가 시작 서비스·고정 의존성 정의·명시적 러너 변수를 공유합니다.
Compose·Dockerfile·테스트 경로는 실행하는 체크아웃에서 해석합니다.
[설정 계약](configuration.md)에 따라 실제 구현된 서비스를 선언하세요. 종류 이름만으로
인프라가 설치되거나 mock이 구현되지는 않습니다.

## 실제 체크아웃 검증

`redpact settings validate --scope project --path /absolute/path/to/project`를 실행합니다.
파일·필드 진단을 수정하고 다시 검증하세요. 고정 설정과 Compose 계획을 검사하며,
서비스 접속·인증 값 해석·테스트 실행·승인은 수행하지 않습니다. 관리형 실행에서 준비
상태와 실제 소비자의 연결을 확인하세요. 기존 설정은 [설정](configuration.md#호환되지-않는-설정-변경)에
설명한 수동 변경이 필요합니다.

[첫 테스트 기록](first-run.md)으로 이어가세요.
