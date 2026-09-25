---
title: 데스크톱 런타임
description: Native 프로세스 소유권, 로컬 설치와 서명된 업데이트 경계를 설명합니다.
---

# 데스크톱 런타임

Tauri 2가 OS WebView에서 연결된 React UI를 호스팅합니다. 번들 Node 24가 Hono
HTTP/MCP 서버를 자식 프로세스로 실행하며 Core는 Tauri와 독립적입니다. Native Rust가
수명주기와 업데이트를 소유합니다. 주 WebView는 범위가 제한된 네 명령으로 캐시된
업데이트 상태를 읽고 설치 없이 수동 확인하거나 native 설치 확인 대화상자를 요청하며 고정된 공개 GitHub
저장소를 기본 브라우저로 열 수 있습니다. 최종 사용자는 Redpact용 Node를 별도 설치할 필요가 없습니다.

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
이 데스크톱 명령은 소유 서버 origin의 주 창에만 허용하며 호출 origin을 추가로 검사합니다.
다른 loopback 페이지에는 데스크톱 작업 권한을 부여하지 않습니다. GitHub 명령은 URL 인자를
받지 않고 `https://github.com/wo658/redpact`만 엽니다. Star도 같은 페이지를 열며 사용자가
GitHub에 로그인하여 직접 별을 줍니다. 자동으로 Star를 추가하지 않습니다.

## 수동 preview 다운로드

[Mac preview 워크플로](../.github/workflows/desktop-preview.yml)는 서명된 updater
릴리스와 별개입니다. 버전과 일치하는 `desktop-preview-v<version>` 태그를 push하세요.
`tauri.preview.conf.json`으로 updater 키 없이 Apple Silicon·Intel native runner에서
ad-hoc 서명된 앱을 빌드합니다. Apple Silicon은 DMG, Intel은 디스크 이미지 생성 실패로
앱 ZIP을 제공합니다. 각 runner는 패키지를 풀어 서명과
번들 Node 아키텍처를 확인합니다. 격리된 데이터로 네이티브 앱을 실행하고 HTTP health,
뷰어 HTML, MCP 초기화를 검사하며 부모 종료 후 소유 서버 종료까지 확인합니다.
Gatekeeper 승인, 모든 WebView 컨트롤, Docker 테스트, 이전 버전 업그레이드는 검증하지 않습니다.

두 job이 모두 통과해야 두 패키지와 `SHA256SUMS`를 포함한 Draft prerelease를 만듭니다.
증거를 검토하고 stable updater feed를 보존하도록 `--latest=false`로 공개하세요.
공개된 파일을 교체하지 마세요. Preview에는 updater feed가 없으므로 앱을 수동 교체합니다.
아래 서명된 워크플로는 계속 지속적인 비공개 키를 요구합니다. 사용자 설치·제거는
[설치 안내](installation.md)를 참고하세요. Homebrew Cask도 동일한 아키텍처별 파일과 체크섬을 사용합니다.
Apple 공증과 Universal 빌드는 제공하지 않습니다.

## Windows와 Linux preview 검증

[플랫폼 워크플로](../.github/workflows/desktop-portability.yml)를 수동 실행하면 Windows Server 2022에서
Windows x64 NSIS 설치기를, Ubuntu 22.04에서 Linux x64 DEB를 빌드합니다.
같은 preview 설정을 사용하며 updater 키는 필요하지 않습니다. Windows 압축 해제는
OS의 `tar.exe`를 사용해 Git Bash의 경로·압축 형식 충돌을 피합니다. 패키징은 기존
Execa 의존성으로 pnpm을 실행하며 인자를 그대로 보존합니다.

두 job은 패키지를 보존하고 Rust 테스트·린트를 실행한 뒤 실제 패키지를 설치합니다.
독립 설정으로 설치된 데스크톱을 실행하고 번들 Node, HTTP 상태·뷰어, MCP를 확인한 뒤
소유 서버 종료와 패키지 제거를 검사합니다. Linux에서는 Xvfb와 D-Bus 세션을 사용합니다.
Windows 10/11 대화형 설치·SmartScreen, 모든 WebView 컨트롤, 모든 Linux 창 시스템·배포판은
검증 범위가 아닙니다. 다운로드와 사용자 명령은 [설치 안내](installation.md)에 있습니다.

네이티브 검증과 저장소 검사가 통과하면 검토한 소스 커밋에 버전과 일치하는
`desktop-platform-preview-v<version>` 태그를 만들고 해당 워크플로의 정확한 아티팩트와
`SHA256SUMS`를 draft prerelease에 업로드하세요. 파일을 확인한 뒤 `--latest=false`로
공개합니다. 기존 Mac 릴리스와 체크섬은 유지하세요. 공개 후
[공개 플랫폼 설치 검증](../.github/workflows/desktop-platform-installation.yml)을 실행하면
인증 없는 릴리스 URL에서 다운로드하고 체크섬·설치·실행·제거를 재빌드 없이 검사합니다.
공개한 파일을 교체하지 마세요.
이 preview에는 Windows 게시자 서명, AppImage/RPM, ARM 빌드와 updater feed가 없습니다.

## 서명된 업데이트

데스크톱은 시작 시와 6시간마다 새 버전을 확인합니다. 사이드바에는 새 버전이 발견된
경우에만 텍스트 **Update** 버튼이 나타납니다. 수동 **업데이트 확인**은 설정 → 업데이트에
있으며 사이드바와 네이티브 메뉴에는 상시 확인 동작이 없습니다. 설정에서 확인해도
설치나 설치 승인을 요청하지 않습니다. 확인 성공 시 공유 버전 표시를 갱신하고,
feed 미설정이나 확인 실패는 최신 상태가 아닌 오류로 표시합니다.

**Update**를 누르면 릴리스를 다시 확인한 뒤 네이티브 설치·재시작 확인을 요청합니다.
확인·설치 중에는 업데이트 버튼을 비활성화합니다. 취소나 진행 중 작업으로 인한 보류는
새 버전 표시를 유지합니다. 네이티브 상태는 5초마다 읽으며 읽기에 실패하면 다음 성공까지
사이드바 표시를 숨깁니다. 백그라운드 feed 확인 실패는 이미 발견한 버전을 유지하고,
새 버전이 없다는 확인이 성공하면 버튼을 숨깁니다. npm 설치도 같은 버튼과 설정 위치를
사용하지만 [런타임 설치·재시작 경로](installation.md)는 별도입니다.

릴리스 빌드는 `https://github.com/wo658/redpact/releases/latest/download/latest.json`을
계속 사용합니다. 주 WebView에는 상태 읽기, 설치 없는 수동 확인, 설치 확인 요청,
고정 저장소 열기를 위한 범위가 제한된 네이티브 명령을 제공합니다.

저장소의 `tauri.release.conf.json`은 updater 아티팩트를 활성화하고 공개 검증 키를
고정합니다. 일반 로컬 빌드는 이 overlay를 사용하지 않으며 업데이트 미설정을 안내합니다.
릴리스 준비 단계는 overlay의 endpoint와 공개 키를 컴파일 시
`REDPACT_UPDATE_ENDPOINT`, `REDPACT_UPDATE_PUBLIC_KEY`로 기존 native updater에 전달합니다.

릴리스 공개 키는 설정되어 있으며 대응하는 비공개 키는 저장소의
`TAURI_SIGNING_PRIVATE_KEY` Actions Secret에 보관합니다. 현재 키에는 암호가 없으므로
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`는 필요하지 않습니다. 이후 릴리스에도 같은 키를
유지하세요. 아래 키 생성 절차는 매 빌드가 아닌 최초 설정용입니다.
공개 릴리스 다운로드에는 GitHub 토큰이나 사용자가 입력하는 키가 필요하지 않습니다.
서명 키는 업데이트 파일의 진위를 확인하는 용도입니다. 공개 키와 주소는 저장소의 빌드
설정에 포함되어 있으므로 별도 Actions Variables가 필요하지 않습니다.

### GitHub Release 워크플로

[제품 릴리스 워크플로](../.github/workflows/desktop-release.yml)는 Apple Silicon·Intel
macOS native runner와 Windows Server 2022에서 빌드합니다.
[Tauri Action](https://github.com/tauri-apps/tauri-action)이 Apple Silicon DMG, Intel 앱 ZIP,
Windows NSIS installer, 서명된 updater 번들·서명과 `latest.json`을 하나의 **Draft**
GitHub Release에 올립니다. 모든 manifest 플랫폼 항목을 보존하도록 순차 업로드합니다.
각 job은 native 테스트·린트와 패키지 설치를 실행해 앱 시작, 번들 Node, HTTP 뷰어,
MCP 및 소유 서버 종료를 검증합니다. 모든 desktop job과 공통 [npm 설치 검증](development.md)이 성공해야 GitHub Release와
검증한 npm 아티팩트를 trusted publishing으로 공개합니다. 데스크톱 공개 단계는
설치 검증한 Draft 패키지를 그대로 사용하며 재빌드하지 않습니다. 앱 updater에는 완성 전 Draft가 노출되지 않습니다.

유지관리자의 설정·릴리스 절차:

1. `pnpm --filter @redpact/desktop exec tauri signer generate --write-keys /secure/path/redpact.key`로
   지속 사용할 키를 생성합니다. 비공개 키를 저장소 밖에 백업하고 공개 키를
   `tauri.release.conf.json`에 설정합니다. 비공개 키는 커밋하지 않습니다.
   키를 분실하거나 교체하면 기존 설치 앱의 업데이트가 끊깁니다.
2. 저장소 Actions Secret `TAURI_SIGNING_PRIVATE_KEY`에 비공개 키 내용을 등록합니다.
   암호가 있으면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`도 등록합니다.
3. `app/desktop/src-tauri/tauri.conf.json`, `app/desktop/src-tauri/Cargo.toml`,
   `app/desktop/package.json`, `app/server/package.json`의 버전을 맞추고
   `Cargo.lock`을 갱신한 뒤 커밋합니다. 검증한 제품 스냅샷 태그 `v0.4.1` 하나를
   push합니다. 수동 실행도 일치하는 태그를
   선택해야 합니다. 버전 불일치, prerelease 태그, 서명 설정 누락은 패키징 전에 실패합니다.
4. 모든 job의 성공 후 `latest.json`에 해당 버전의 `darwin-aarch64`, `darwin-x86_64`,
   Windows 항목, 비어 있지 않은 서명, 다운로드 가능한 태그별 아티팩트가 있는지 확인합니다.
   npm에 같은 버전이 공개됐는지 확인하고 이전 릴리스로부터의 업데이트를 검증합니다.
   workflow가 완성된 Draft를 최신 stable 릴리스로 공개합니다. 공개한 버전의 파일을 교체하지 않습니다. GitHub의 최신 stable
   릴리스에는 데스크톱 파일이 있어야 하며 관계없는 릴리스가 최신이면 feed가 깨집니다.

첫 릴리스는 수동 설치해야 합니다. 기존 개발 빌드에는 feed가 없습니다. 첫 릴리스 공개는
이전 버전에서의 업그레이드 검증이 아닙니다. Tauri는 updater 서명을 검증합니다.
워크플로는 현재 macOS ad-hoc 코드 서명을 사용하며 **Apple Developer ID 서명·공증은
하지 않습니다**. 첫 설치를 Gatekeeper가 차단할 수 있습니다. 원활한 공개 배포를 위한
Apple 서명·공증에는 별도 자격 증명과 설정이 필요합니다.
Native 확인 후 설치·재시작하며 백그라운드 확인만으로 자동 설치하지 않습니다.
차등 다운로드와 재시작 없는 업데이트는 구현하지 않습니다.

설치 전 부모는 유휴 종료를 요청합니다. 수락된 요청이 끝나는 동안 새 HTTP/MCP 수락을
멈춥니다. 활성 테스트·환경 작업이 있으면 설치를 미루고 수락을 복원합니다. 유휴 설치는
서버 lock을 해제한 뒤 교체합니다. 종료 후 설치 실패 시 사용자에게 Quit·재열기를
안내하며 자동 binary rollback은 없습니다. 설정·증거는 앱 bundle 밖에서 현재 저장
형식 정책을 따릅니다. 서명된 전체 전달은 릴리스 검증이 필요하며 unsigned 로컬 빌드나
feed 미설정 안내만으로 입증하지 않습니다.

구현: [데스크톱 소스](../app/desktop/src-tauri),
[로컬 installer](../app/desktop/tools/local-update.ts).
