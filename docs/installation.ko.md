---
title: 설치와 에이전트 연결
description: GitHub 기반 Homebrew·터미널 경로로 Redpact를 설치하고 Codex·Claude Code를 연결합니다.
---

# 설치와 에이전트 연결

Redpact의 공개 소스와 런타임 다운로드는
[wo658/redpact](https://github.com/wo658/redpact)에서 제공합니다. 런타임 패키지는
CLI와 브라우저 뷰어를 설치합니다. Tauri 데스크톱 앱은 설치하지 않습니다.

## 설치 경로 선택

| 경로 | 설치 대상 | 요구 사항 / 제한 |
| --- | --- | --- |
| macOS 데스크톱 다운로드 | 네이티브 앱, 서버, 뷰어, Node | macOS 13.5+, Apple Silicon 또는 Intel, 공증 없는 preview |
| Windows/Linux 데스크톱 preview | 네이티브 앱, 서버, 뷰어, Node | Windows x64 EXE, Ubuntu 22.04 x64 DEB, 수동 업데이트 |
| Homebrew 자체 Tap | CLI Formula 또는 macOS 데스크톱 Cask | 데스크톱은 `--cask`로 선택, 공증 없는 preview |
| 터미널 설치기 | `~/.local` 아래 CLI와 브라우저 뷰어 | macOS 또는 Linux, Node 24+, npm, curl, SHA-256 도구 |
| GitHub 릴리스 tarball과 npm/pnpm | CLI와 브라우저 뷰어 | Node 24+와 npm 또는 pnpm |
| GitHub 소스 체크아웃 | 기여자용 빌드 | Node 24+, pnpm, 데스크톱은 Rust 추가 필요 |
| Codex 플러그인 | MCP 연결과 스킬 | Codex, 54321 포트에서 실행 중인 Redpact |
| Claude Code 플러그인 | MCP 연결과 스킬 | Claude Code, 동일한 실행 중 인스턴스 |

관리형 실행에는 Docker와 Compose가 추가로 필요합니다. Git 기능은 네이티브 Git을
사용하며 관리형 워크트리 생성에는 유지보수되는 Git 2.50+가 필요합니다. 설치와 MCP
연결 성공이 Docker 준비 상태나 클라이언트의 MCP Apps 지원을 증명하지는 않습니다.
Windows CLI 설치, Windows/Linux ARM, 다른 Linux 배포판과 Universal macOS
설치기는 미검증입니다. macOS preview는 Apple 공증을 받지 않았으며
Windows preview에는 게시자 코드 서명 인증서가 없습니다.

## macOS 데스크톱 다운로드

[Mac 데스크톱 preview](https://github.com/wo658/redpact/releases/tag/desktop-preview-v0.1.0)에서 CPU에 맞는 패키지를 다운로드하세요.

- Apple Silicon(M 시리즈): `Redpact_0.1.0_aarch64.dmg`.
- Intel: `Redpact_0.1.0_x64.zip`.

Apple Silicon DMG를 열거나 Intel ZIP을 압축 해제하고 **Redpact**를 **Applications**로 드래그한 뒤 사용한 디스크 이미지가 있으면 추출하고
Redpact를 실행하세요. Node·서버·뷰어가 포함되어 터미널에서 서버를 실행할 필요가 없습니다.
최초 MCP 주소는 `http://127.0.0.1:54321/mcp`입니다. 같은 포트를 사용하는 다른
Redpact 인스턴스가 있다면 먼저 종료하세요.

이 preview는 ad-hoc 서명을 사용하며 **Apple 공증을 받지 않았습니다**.
`shasum -a 256 <다운로드한파일>` 결과를 릴리스의 `SHA256SUMS`와 비교하세요.
macOS가 차단하면 출처를 확인한 뒤 시스템 설정 → 개인정보 보호 및 보안에서
[Apple의 앱별 ‘확인 없이 열기’ 안내](https://support.apple.com/ko-kr/102445)를 따르세요.
Gatekeeper를 전역으로 해제하지 마세요. 체크섬 일치는 릴리스 파일의 일치 여부이며 Apple 심사가 아닙니다.

업데이트는 수동입니다. 활성 작업을 마치고 Redpact를 종료한 뒤 새 패키지를 받아
Applications의 앱을 교체하세요. 이 preview에는 자동 업데이트 feed가 없습니다.
제거하려면 종료 후 `Redpact.app`을 삭제하세요. 설정과 결과는
`~/Library/Application Support/dev.redpact.desktop/state`에 남습니다.
[데스크톱 수명주기와 릴리스 경계](desktop.md)를 참고하세요.

### Homebrew 데스크톱 Cask

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install --cask wo658/redpact/redpact
open /Applications/Redpact.app
```

Cask는 Apple Silicon DMG 또는 Intel ZIP를 선택하고 체크섬을 검증합니다.
직접 다운로드와 동일하게 공증·최초 실행 제한이 적용됩니다. 새 Cask 버전으로
업데이트하려면 Redpact를 종료한 뒤 `brew update`와
`brew upgrade --cask wo658/redpact/redpact`를 실행하세요.
제거는 `brew uninstall --cask wo658/redpact/redpact`이며 인스턴스 데이터는 보존됩니다.
기존 DMG를 수동 설치했다면 종료하고 해당 앱을 Applications 밖으로 옮긴 뒤
Cask를 설치하세요. 새 앱의 실행이 확인될 때까지 이전 복사본을 보관하세요.

## Windows와 Linux 데스크톱 preview

[Windows/Linux preview](https://github.com/wo658/redpact/releases/tag/desktop-platform-preview-v0.1.0)에서 OS에 맞는 패키지를 다운로드하세요.
Node·서버·뷰어가 포함되어 있습니다. 실행 전 54321 포트를 사용하는 다른 Redpact를
종료하세요. 최초 MCP 주소는 `http://127.0.0.1:54321/mcp`입니다.

### Windows x64

`Redpact_0.1.0_x64-setup.exe`를 받아 실행하고 시작 메뉴에서 Redpact를 여세요.
설치기는 필요한 경우 WebView2를 설치하므로 최초 설치 시 인터넷 연결이 필요할 수
있습니다. 이 preview에는 코드 서명이 없어 Windows SmartScreen 게시자 경고가
나타날 수 있습니다. 릴리스 출처를 확인하고 `Get-FileHash <파일> -Algorithm SHA256`
결과를 `SHA256SUMS`와 비교하세요. GitHub Windows Server 2022 러너에서 네이티브
빌드, 무인 설치, 앱·서버·뷰어·MCP 실행과 제거를 검사합니다. Windows 10/11의
대화형 설치와 SmartScreen 허용은 이 검사에 포함되지 않습니다.

업데이트는 Redpact를 종료한 뒤 새 설치기를 실행하세요. 제거는 Windows 설정 → 앱을
사용합니다. 인스턴스 설정·결과는 설치 경로와 별개인
`%APPDATA%\dev.redpact.desktop\state`에 남습니다.

### Ubuntu x64

`Redpact_0.1.0_amd64.deb`를 받아 `sha256sum <파일>`을 `SHA256SUMS`와 비교한 뒤 실행하세요.

```sh
sudo apt install ./Redpact_0.1.0_amd64.deb
redpact-desktop
```

패키지 관리자가 WebKitGTK를 포함한 시스템 라이브러리를 설치합니다. Ubuntu 22.04 x64에서
네이티브 빌드, DEB 설치, 가상 X 디스플레이의 데스크톱·서버·뷰어·MCP 실행과 패키지
제거를 검사합니다. 모든 Linux 배포판·Wayland 세션·데스크톱 환경의 호환성을 뜻하지
않습니다. AppImage·RPM·ARM 패키지는 제공하지 않습니다.

업데이트는 Redpact를 종료한 뒤 `apt install ./<파일>`로 새 DEB를 설치하세요.
제거는 `sudo apt remove redpact`이며 인스턴스 데이터는
`${XDG_DATA_HOME:-$HOME/.local/share}/dev.redpact.desktop/state`에 남습니다.
두 preview 모두 수동 업데이트이며 [데스크톱 수명주기](desktop.md)를 따릅니다.
설치 검사는 관리형 Docker 실행이나 모든 WebView 동작의 검증이 아닙니다.

## Homebrew

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install wo658/redpact/redpact
redpact serve --port 54321
```

업데이트는 `brew update && brew upgrade wo658/redpact/redpact`, 제거는
`brew uninstall wo658/redpact/redpact`를 사용합니다. 별도 런타임 데이터는 유지됩니다.
Homebrew core가 아닌 프로젝트 자체 Tap입니다. 소스 저장소 이름이
`homebrew-redpact`가 아닌 `redpact`이므로 Tap 추가 시 저장소 URL을 명시합니다.

## 터미널 설치기

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

스크립트는 지정된 런타임 릴리스와 `SHA256SUMS`를 받아 체크섬을 검증한 뒤 npm으로
설치합니다. Node 24+와 npm이 미리 설치되어 있어야 하며 sudo는 사용하지 않습니다.
새 터미널에도 적용하려면 PATH 설정을 셸 프로필에 저장하세요. 실행 전 검토하려면
`install.sh`를 내려받아 읽고 `sh install.sh`로 실행하세요. 절대 경로 지정은
`sh install.sh --prefix /absolute/path`로 지원합니다.
설치기를 다시 실행하면 해당 스크립트가 선택하는 릴리스를 설치합니다. 다른 실행 파일은
덮어쓰지 않습니다. 이 경로의 제거 대상은 `<prefix>/bin/redpact`와
`<prefix>/share/redpact`이며, 의도하지 않았다면 런타임 데이터 디렉터리는 삭제하지 마세요.

## GitHub 릴리스 패키지

[런타임 릴리스](https://github.com/wo658/redpact/releases/tag/runtime-v0.1.0)에서
패키지와 체크섬을 확인하거나 다음 두 패키지 관리자 중 하나로 URL을 직접 설치하세요.

```sh
npm install --global --ignore-scripts https://github.com/wo658/redpact/releases/download/runtime-v0.1.0/redpact-0.1.0.tgz
# 또는:
pnpm add --global --ignore-scripts https://github.com/wo658/redpact/releases/download/runtime-v0.1.0/redpact-0.1.0.tgz
redpact serve --port 54321
```

사용자에게 쓰기 권한이 있는 전역 패키지 디렉터리를 사용하세요. 앞의 터미널 설치기는
전역 디렉터리 설정 없이 설치하며 릴리스 체크섬을 자동 검증합니다.
`npm install -g redpact`, `pnpm add -g redpact`, `npx redpact`처럼 이름만 사용하는
경로는 npm 레지스트리 릴리스 게시 전까지 사용할 수 없습니다. GitHub tarball 설치에는
npm 게시 자격증명이 필요하지 않습니다. 의존성은 여전히 npm에서 받습니다.

## 에이전트 플러그인 설치

먼저 `redpact serve --port 54321`을 실행하고 터미널을 유지하세요. 뷰어는
`http://127.0.0.1:54321`에서 엽니다. 데스크톱이 이미 그 포트를 사용한다면
두 번째 인스턴스를 실행하지 말고 기존 데스크톱에 연결하세요.

Codex:

```sh
codex plugin marketplace add wo658/redpact
codex plugin add redpact@redpact
```

새 작업을 시작하고 프로젝트 설정은 `$redpact-init`, 개발은 `$redpact`를 사용하세요.

Claude Code:

```sh
claude plugin marketplace add wo658/redpact
claude plugin install redpact@redpact
```

새 세션에서 `/redpact:redpact-init` 또는 `/redpact:redpact`를 사용하세요.
두 카탈로그는 공개 GitHub 저장소의 동일한 자체 포함 스킬·MCP 파일을 설치합니다.
플러그인 설치는 Redpact 설치·실행, Docker 설치, 테스트 승인을 대신하지 않습니다.
프로젝트가 호스팅하는 카탈로그이며 OpenAI나 Anthropic의 공식 추천 목록 등재를
의미하지 않습니다.

플러그인은 `http://127.0.0.1:54321/mcp`를 사용합니다. 다른 인스턴스를 쓰려면
플러그인이 자동으로 따라간다고 가정하지 말고 실제 포트로 HTTP MCP를 직접 연결하세요.
다른 클라이언트도 이 연결을 사용할 수 있으나 검증된 플러그인 통합으로 주장하지 않습니다.
도구 확인에는 에이전트에게 `configure describe` 호출을 요청하세요.
승인·자격증명 카드는 호환되는 MCP Apps 호스트가 필요합니다. 플러그인 설치만으로 카드
지원을 증명할 수 없으며, 승인 UI가 없다고 승인을 우회해서는 안 됩니다.
[인터페이스 계약](interfaces.md)을 참고하세요.

## 사전 준비

서버와 웹 뷰어를 실행하려면 Node.js 24 이상과 pnpm이 필요합니다. 관리형 테스트 실행에는 Compose를 포함한 Docker도 필요합니다. 단위 테스트 명령은 프로젝트에 설정된 Dockerfile을 사용해 Docker에서 실행하고, 관리형 통합 테스트는 Compose 애플리케이션 서비스를 준비합니다. Git 기능은 네이티브 Git을 사용합니다. 관리형 워크트리 생성에는 유지보수되는 Git 2.50 이상을 사용하세요.

Redpact 소스 체크아웃에서 다음 명령을 실행하세요.

```sh
pnpm install --frozen-lockfile
pnpm --filter @redpact/server build
```

의존성을 설치하면 이 저장소의 Git 훅이 활성화됩니다. 데스크톱 애플리케이션을 설치하거나 런타임 패키지를 게시하는 작업은 아닙니다.

## 서버와 뷰어 실행

설정과 결과를 보관할 전용 디렉터리의 절대 경로를 지정해 서버를 시작하세요.

```sh
node app/server/dist/cli.js serve --data-dir /absolute/path/to/redpact-state --port 54318
```

예제 경로를 계속 보관할 위치로 바꾸세요. 한 데이터 디렉터리는 동시에 하나의 프로세스만 사용할 수 있습니다. 시작할 때 프로젝트를 연결하려면 `--project /absolute/path/to/your-project`를 추가하세요.

다른 터미널을 열고 같은 Redpact 체크아웃에서 실행하세요.

```sh
REDPACT_API_URL=http://127.0.0.1:54318 pnpm --filter @redpact/web dev
```

Vite가 출력한 루프백 URL을 여세요. 뷰어는 API 요청을 서버로 프록시합니다. 두 프로세스를 모두 실행 상태로 유지하세요. 서버 상태는 `http://127.0.0.1:54318/api/health`에서 확인할 수 있습니다.

CLI의 기본 포트는 `54318`입니다. `--port`를 지정하면 해당 실행에 한해 인스턴스 설정을 덮어씁니다. 포트가 사용 중이면 시작에 실패합니다. Redpact는 루프백에 바인딩하며 API 토큰을 요구하지 않습니다. 공개 노출을 전제로 한 서비스가 아닌 로컬 애플리케이션입니다.

## 연결을 순서대로 확인하기

서버, 뷰어, 에이전트는 각각 연결을 사용합니다. 뷰어 연결 문제를 테스트 실행 문제로 오해하지 않도록 다음 순서로 확인하세요.

```sh
node --version
pnpm --version
docker version
docker compose version
curl --fail http://127.0.0.1:54318/api/health
```

`docker version`에는 클라이언트뿐 아니라 서버 정보도 나와야 합니다. Docker 데몬에 연결하지 못한다면 관리형 실행 전에 Docker를 시작하세요. Redpact 서버가 요청을 받을 준비가 되면 health 요청이 성공해야 합니다. 이 확인만으로 애플리케이션 이미지 빌드나 서비스 준비 상태까지 검증되는 것은 아닙니다.

다음으로 Vite 뷰어를 열어 애플리케이션 디렉터리를 연결하고, 마지막으로 에이전트에서 `configure describe`를 호출하세요. health는 성공하지만 에이전트가 연결하지 못한다면 프로젝트 테스트 설정 대신 MCP 주소와 클라이언트 연결을 확인하세요.

## 같은 인스턴스의 주소 사용하기

| 구성 요소 | 소스 실행 예시 | 데스크톱 기본값 |
|---|---|---|
| Redpact API | `http://127.0.0.1:54318` | `http://127.0.0.1:54321` |
| 에이전트 MCP 주소 | `http://127.0.0.1:54318/mcp` | `http://127.0.0.1:54321/mcp` |
| 뷰어 | 위 API로 프록시하는 Vite 주소 | 데스크톱에 포함된 창 |
| 실행 이력 | `--data-dir`로 지정한 디렉터리 | 데스크톱 인스턴스의 자체 데이터 디렉터리 |

`4310` 포트의 공개 문서 프리뷰는 별도의 읽기용 사이트입니다. 프로젝트 뷰어나 MCP 주소를 제공하지 않습니다. 문서 페이지가 열린다고 실행 서버가 동작 중인 것은 아닙니다.

재시작 후에도 같은 이력을 보려면 소스 서버의 데이터 디렉터리를 유지하세요. 같은 디렉터리로 다른 서버를 시작하기 전에 기존 프로세스를 종료해야 합니다. 네트워크 포트가 같아도 새 빈 디렉터리로 시작하면 다른 인스턴스 상태를 보게 됩니다.

## 에이전트 연결

에이전트 클라이언트에 다음 주소로 Streamable HTTP MCP 연결을 추가하세요.

```text
http://127.0.0.1:54318/mcp
```

설정 문법은 클라이언트마다 다릅니다. 클라이언트의 HTTP MCP 연결 기능을 사용하세요. Redpact는 이 흐름을 위한 stdio 브리지를 제공하지 않습니다. 모델에 제공하는 도구는 `configure`, `run_tests`, `get_run`, `request_keys`입니다.

경로를 바꾼 뒤 에이전트에게 다음 인자로 `configure`를 호출하도록 요청하세요.

```json
{
  "action": "describe",
  "path": "/absolute/path/to/your-project"
}
```

설정 스키마와 작성 지침을 받으면 연결을 확인한 것입니다. Docker 실행 준비를 확인하거나 테스트를 실행한 것은 아닙니다.

에이전트와 뷰어를 같은 인스턴스에 연결하세요. 한 서버의 결과는 다른 서버의 기록에 나타나지 않습니다. 함께 제공되는 로컬 플러그인은 데스크톱 기본 포트인 `54321`을 사용하며, `54318`에서 실행 중인 개발 서버를 자동으로 따라가지 않습니다.

## 선택 사항: macOS 데스크톱 빌드

데스크톱 앱은 뷰어, 서버, Node 런타임을 함께 제공합니다. 빌드하려면 Node와 pnpm 외에 Rust stable과 해당 플랫폼의 Tauri 사전 요구사항이 필요합니다. macOS에는 Xcode Command Line Tools가 필요하며, 번들 Node 런타임은 macOS 13.5 이상을 요구합니다. Windows·Linux 빌드와 설치 검증 범위는 위의 preview 안내를 참고하세요.

개발용으로는 Redpact 체크아웃에서 `pnpm desktop:dev`를 실행하세요. 개인용 macOS 설치는 다음 명령을 사용합니다.

```sh
pnpm desktop:update
```

이 명령은 현재 체크아웃을 빌드하고 `/Applications/Redpact.app`에 설치한 뒤 실행하고 상태를 확인합니다. 기존 설치를 교체할 수 있으므로 진행 중인 작업을 먼저 마치세요. 공개 배포용 공증 릴리스가 아닌 임시 서명된 개발 빌드입니다. 에이전트 플러그인 설정은 업데이트하지 않습니다.

데스크톱 앱은 별도 인스턴스를 사용합니다. 처음 실행할 때의 MCP 주소는 `http://127.0.0.1:54321/mcp`입니다. 포트를 변경했다면 저장된 인스턴스 포트를 사용하세요. 창을 닫아도 서버는 유지되지만 Redpact를 종료하면 서버도 종료됩니다. 개발 서버의 기록이 데스크톱에 자동으로 표시되지는 않습니다.

[첫 프로젝트 설정](first-project.md)으로 이어가거나 [문제 해결](troubleshooting.md)을 참고하세요.
