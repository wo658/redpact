---
title: 데스크톱 런타임
description: Native 프로세스 소유권, 로컬 설치와 서명된 업데이트 경계를 설명합니다.
---

# 데스크톱 런타임

Tauri 2가 OS WebView에서 연결된 React UI를 호스팅합니다. 번들 Node 24가 Hono
HTTP/MCP 서버를 자식 프로세스로 실행하며 Core는 Tauri와 독립적입니다. WebView에는
특권 Tauri command capability가 없습니다. Native 메뉴가 수명주기와 업데이트를
소유합니다. 최종 사용자는 Redpact용 Node를 별도 설치할 필요가 없습니다.

## 빌드와 검증

Node 24+, pnpm, Rust stable과 플랫폼 Tauri 요구사항이 필요합니다. macOS는 Xcode
Command Line Tools와 번들 Node용 macOS 13.5+가 필요합니다. 해당 기능에는 native
Git, Docker/Compose, 인증된 `gh`가 계속 필요합니다.

```sh
pnpm desktop:dev
pnpm desktop:build
# Finder 장식 작업 없는 무인 macOS 패키징:
CI=true pnpm desktop:build
```

준비는 웹·서버를 빌드하고 고정 production 의존성을 구성하며 공식 Node archive의
SHA-256을 최초 및 캐시 재사용 전에 검사합니다. Provenance에 버전과 digest를 기록합니다.
앱 시작 시 의존성 설치나 런타임 다운로드를 하지 않습니다. 대상 OS·아키텍처에서 빌드하고
다른 호스트의 Node를 몰래 패키징하지 않습니다. macOS 빌드는 Windows/Linux 검증이 아닙니다.

생성 리소스와 Cargo 출력은 `app/desktop/node_modules/.redpact/`에 있습니다.
macOS 앱은 그 아래 `target/release/bundle/macos/Redpact.app`, DMG는 형제 `dmg`
디렉터리입니다. `app/desktop/src-tauri`에서 `cargo test --locked`,
`cargo clippy --locked -- -D warnings`를 실행합니다. 서버 수명주기 테스트는
`app/server/test/desktop-*.test.ts`, 관리 인수는 `e2e/tests/desktop-runtime.test.ts`입니다.

## 로컬 설치

`pnpm desktop:update`는 미커밋 변경을 포함한 현재 체크아웃을 빌드하고 ad-hoc 서명을
검사한 뒤 대상 파일시스템에 준비하여 `/Applications/Redpact.app`을 교체합니다.
앱 실행과 프로세스·HTTP health를 검사합니다. Developer ID 공증 없는 로컬 개발
빌드이며 DMG나 업데이트 feed가 필요 없습니다. Rust는 `~/.cargo/bin`에서도 찾습니다.

교체 전에 기존 앱에 정상 Quit을 요청하고 종료 실패 시 교체를 막습니다. 이전 앱은
출력된 `/Applications/.redpact-install-*/previous.app`에 남으며 교체 실패 시 복원합니다.
시작 실패는 로그와 복구용 backup을 남기며 런타임 데이터를 자동 rollback하지 않습니다.
Backup을 prune하지 않습니다. 동시 빌드를 피하세요. 설치 lock은
`/Applications/.redpact-update.lock`이며 installer 종료 확인 후에만 stale lock을
제거합니다. 지원 옵션은 `pnpm desktop:update --help`에서 확인합니다.

개발 LaunchAgent나 플러그인 설정은 바꾸지 않습니다. 별도 작업은
[개발 업데이트](development.md)를 참고하세요.

## 인스턴스와 수명주기

데스크톱은 자체 인스턴스를 소유합니다. macOS 기본 데이터 경로는
`~/Library/Application Support/dev.redpact.desktop/state`입니다.
`REDPACT_DESKTOP_DATA_DIR`로 별도 절대 테스트 디렉터리를 지정할 수 있습니다.
다른 실행 인스턴스의 디렉터리를 사용하거나 두 번째 writer를 시작하지 않습니다.

최초 실행은 포트 54321 설정을 만들며 기존 설정·포트는 보존합니다. 그 인스턴스의
`/mcp`에 연결하세요. CLI·개발 서비스는 독립적입니다. 포트 충돌 시 관계없는 서버에
연결하지 않고 시작 실패합니다. `desktop-server.log`는 데스크톱 설정 옆에 있습니다.

창 닫기는 숨기기이며 MCP는 유지됩니다. Dock·Show Redpact로 복원하고 두 번째 앱
실행은 기존 창에 focus합니다. Quit은 작업을 취소하고 정리를 기다립니다. 부모가 죽으면
control pipe가 닫히고 소유 서버를 종료합니다. 정리 timeout은 강제 종료 대신 재시도할
문제로 보고합니다.

비공개 pipe는 `REDPACT_DESKTOP_CONTROL=1`로 켜며 서버는 자식 실행 전 이 변수를
제거합니다. 준비·종료·유휴 업데이트 제어용이고 공개 HTTP endpoint가 아닙니다.
WebView는 허용된 loopback·about:blank 탐색만 허용하고 외부·file 탐색은 거부합니다.
Loopback 페이지에 native bridge 권한이 생기지 않습니다.

## 서명된 업데이트

Check for Updates는 native 메뉴에 있습니다. 개발 빌드에 feed가 없으면 이를 알립니다.
업데이트 가능한 릴리스에는 실제 HTTPS endpoint, Tauri 서명 key pair, 플랫폼·아키텍처
아티팩트가 필요합니다. `REDPACT_UPDATE_ENDPOINT`, `REDPACT_UPDATE_PUBLIC_KEY`,
비공개 `TAURI_SIGNING_PRIVATE_KEY`와 Tauri 빌드의 `bundle.createUpdaterArtifacts`를
설정합니다. 비공개 키를 커밋하지 않습니다. 불변 서명 아티팩트를 manifest보다 먼저 게시합니다.

Tauri는 업데이트 서명을 검증하며 macOS Developer ID 서명·공증은 별도 배포 요건입니다.
Production feed나 서명 자격 증명을 자동 제공하지 않습니다. Native 메뉴 확인 후 설치·
재시작합니다. 예약된 background 검사, 차등 다운로드, 재시작 없는 업데이트를 보장하지 않습니다.

설치 전 부모는 유휴 종료를 요청합니다. 수락된 요청이 끝나는 동안 새 HTTP/MCP 수락을
멈춥니다. 활성 테스트·환경 작업이 있으면 설치를 미루고 수락을 복원합니다. 유휴 설치는
서버 lock을 해제한 뒤 교체합니다. 종료 후 설치 실패 시 사용자에게 Quit·재열기를
안내하며 자동 binary rollback은 없습니다. 설정·증거는 앱 bundle 밖에서 현재 저장
형식 정책을 따릅니다. 서명된 전체 전달은 릴리스 검증이 필요하며 unsigned 로컬 빌드나
feed 미설정 안내만으로 입증하지 않습니다.

구현: [데스크톱 소스](../app/desktop/src-tauri),
[로컬 installer](../app/desktop/tools/local-update.ts).
