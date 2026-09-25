# Redpact

Expand your language below. / 아래에서 원하는 언어를 펼쳐 보세요.

<details>
<summary><strong>한국어</strong></summary>

Redpact는 에이전트가 작성한 테스트 의도, 제출된 소스와 실제 실행 결과를 검토하는
로컬 개발 리뷰 도구입니다. 연결된 웹/Tauri 뷰어에서 로컬 체크아웃의 Git 변경사항,
Unit 명령, Vitest Integration 결과와 Playwright 증거를 함께 확인할 수 있습니다.

[redpact.dev](https://redpact.dev)에서 Redpact를 살펴보세요.

- [데모 웹사이트](https://redpact.dev) — Redpact의 사용 흐름을 살펴봅니다.
- [문서 사이트](https://redpact.dev/ko/docs/) — 설치 안내와 기능별 문서를 읽습니다.
  [English](https://redpact.dev/en/docs/)도 제공합니다.

## 목차

- [동작 방식](#동작-방식) — 에이전트 개발과 Redpact의 실행·리뷰 흐름
- [설치 및 실행](#설치-및-실행) — CLI, 웹 뷰어와 데스크톱 미리보기 시작하기
- [문서 안내](#문서-안내) — 설정, 아키텍처와 개발 가이드 찾기
- [기여 및 라이선스](#기여-및-라이선스) — 기여 방법과 사용 조건

## 동작 방식

![개발은 Codex 또는 Claude Code에서 진행합니다. Redpact는 테스트 환경과 실행을 관리하고 변경사항, 테스트 결과와 스크린샷을 확인하는 리뷰 UI를 제공합니다.](.github/assets/how-redpact-works.svg)

Codex 또는 Claude Code에서 계획하고, 코드를 작성하고, 작업을 반복합니다.
Redpact는 테스트 환경과 실행을 관리하며, Git 변경사항과 제출된 테스트 의도,
실행 증거를 확인할 수 있는 웹 또는 데스크톱 리뷰 UI를 제공합니다.
리뷰 피드백을 에이전트에 전달해 다음 작업을 이어갑니다. 테스트 통과가 사람의
승인을 의미하지는 않습니다. 자세한 동작 규칙은 [아키텍처](docs/architecture.ko.md)와
[실행](docs/execution.ko.md) 문서를 참고하세요.

[Excalidraw 편집 원본](.github/assets/how-redpact-works.excalidraw)을 내려받아
[Excalidraw](https://excalidraw.com)에서 열 수 있습니다.

## 설치 및 실행

macOS 또는 Linux에 CLI와 함께 제공되는 브라우저 뷰어를 설치합니다.
터미널 설치 프로그램에는 Node.js 24 이상, npm, curl과 SHA-256 도구가 필요합니다.

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

터미널을 실행한 상태로 <http://127.0.0.1:54321>을 엽니다.
이후 터미널에서도 `redpact`를 사용하려면 셸 프로필에 PATH 설정을 추가하세요.

macOS에서는 Homebrew로 설치할 수도 있습니다.

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install wo658/redpact/redpact
redpact serve --port 54321
```

위 명령은 CLI와 웹 뷰어를 설치하며, Tauri 데스크톱 앱은 설치하지 않습니다.
관리형 테스트 실행에는 Docker와 Compose가 추가로 필요합니다.
npm/pnpm 릴리스 URL, Codex·Claude Code 플러그인, 업데이트와 지원 플랫폼은
[설치 가이드](docs/installation.ko.md)를 참고하세요.

Apple Silicon 및 Intel용 [macOS 데스크톱 미리보기](https://github.com/wo658/redpact/releases/tag/desktop-preview-v0.1.0)나
[Windows x64 / Ubuntu x64 미리보기](https://github.com/wo658/redpact/releases/tag/desktop-platform-preview-v0.1.0)를
내려받을 수 있습니다. 검증 범위, 데스크톱 Homebrew Cask, CLI와 에이전트 플러그인은
[설치 문서](docs/installation.ko.md)를 참고하세요. 미리보기는 수동으로 업데이트합니다.
Mac 앱은 Apple 공증을 받지 않았으며 Windows 설치 프로그램에는 게시자 서명이 없습니다.

## 문서 안내

별도 `redpact-web` 웹사이트는 `docs/`에서 관리하는 Markdown을 직접 읽습니다.
사용자 가이드와 구현 참고 문서는 같은 원본을 사용하며, 별도의 내부 매뉴얼은 없습니다.

- [한국어 문서](docs/index.ko.md) / [English documentation](docs/index.md)
- [설치 및 첫 연결](docs/installation.ko.md)
- [설정](docs/configuration.ko.md) 및 [설정 소유권](docs/settings-reference.ko.md)
- [아키텍처](docs/architecture.ko.md) 및 [개발](docs/development.ko.md)
- [UX 탐색](docs/ux-navigation.ko.md)

Node 24 이상과 pnpm을 사용하세요.

```sh
pnpm install --frozen-lockfile
pnpm docs:check
# 렌더링에는 별도 redpact-web 체크아웃이 필요합니다. 개발 가이드를 참고하세요.
```

애플리케이션 설정, 테스트, 패키징과 업데이트는 [개발 가이드](docs/development.ko.md)를
참고하세요. [Order Desk 예제](examples/order-desk/README.md)는 실행 가능한 첫 Integration
검사를 제공합니다. 로컬 빌드와 미리보기만으로는 배포되지 않습니다.

## 기여 및 라이선스

[기여 안내](CONTRIBUTING.md)에서 시작 방법을 확인하세요.
[에이전트 지침](AGENTS.md)은 동작 변경 시 문서 갱신을 요구하며,
[거버넌스](GOVERNANCE.md)는 공식 프로젝트의 의사결정 방식을 정의합니다.

Copyright 2026 Redpact contributors. 별도 표시가 없는 원본 코드와 문서는
[Apache-2.0](LICENSE)을 따릅니다. 웹 자산과 포함된 구성요소를 비롯한 제3자 라이선스와
고지를 보존해야 합니다. 기여자는 저작권을 유지하며 별도의 CLA는 필요하지 않습니다.
라이선스는 상업적 사용을 허용하지만 Redpact 이름에 대한 권리를 부여하거나
공식적인 보증을 의미하지는 않습니다.

</details>

<details open>
<summary><strong>English</strong></summary>

A local development review tool for agent-authored test intent, submitted source
and observed execution results. The connected web/Tauri viewer reviews Git changes,
Unit commands, Vitest Integration and Playwright evidence across local checkouts.

Explore Redpact at [redpact.dev](https://redpact.dev):

- [Demo Website](https://redpact.dev) — Explore the Redpact demo.
- [Docs Site](https://redpact.dev/en/docs/) — Read the setup guides and reference documentation
  in English or [한국어](https://redpact.dev/ko/docs/).

## Contents

- [How it works](#how-it-works) — Agent development, test execution and review
- [Install and run](#install-and-run) — Start the CLI, web viewer or desktop preview
- [Documentation](#documentation) — Find configuration, architecture and development guides
- [Contributing and license](#contributing-and-license) — Contribution process and usage terms

## How it works

![Development stays in Codex or Claude Code. Redpact manages test environments and execution, and provides a review UI for diffs, test results and screenshots.](.github/assets/how-redpact-works.svg)

Plan, code and iterate with Codex or Claude Code. Redpact manages test environments
and execution, and provides a web or desktop review UI for Git changes, submitted
test intent and execution evidence. Send feedback to your agent for the next iteration. Passing
tests do not establish human acceptance. See [architecture](docs/architecture.md) and
[execution](docs/execution.md) for the detailed contracts.

[Edit the diagram in Excalidraw](.github/assets/how-redpact-works.excalidraw)
(download the file and open it in [Excalidraw](https://excalidraw.com)).

## Install and run

Install the CLI and bundled browser viewer on macOS or Linux. The terminal
installer requires Node.js 24+, npm, curl and a SHA-256 utility:

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

Open <http://127.0.0.1:54321> and keep the terminal running. Add the PATH setting
to your shell profile to use `redpact` in future terminals.

Alternatively, install with Homebrew on macOS:

```sh
brew tap wo658/redpact https://github.com/wo658/redpact.git
brew install wo658/redpact/redpact
redpact serve --port 54321
```

These commands install the CLI and web viewer, not the Tauri desktop app. Managed
test execution additionally requires Docker with Compose. See the
[installation guide](docs/installation.md) ([한국어](docs/installation.ko.md)) for
npm/pnpm release URLs, Codex and Claude Code plugins, updates and supported platforms.

Download the [macOS desktop preview](https://github.com/wo658/redpact/releases/tag/desktop-preview-v0.1.0)
for Apple Silicon or Intel, or the [Windows x64 / Ubuntu x64 preview](https://github.com/wo658/redpact/releases/tag/desktop-platform-preview-v0.1.0).
See [installation](docs/installation.md) for verification limits, the desktop Homebrew
Cask, CLI and agent plugins. Previews use manual updates; the Mac app is not Apple
notarized and the Windows installer has no publisher signature.

## Documentation

The separate `redpact-web` website reads the maintained Markdown in `docs/` directly. User guides and
implementation references share that source; there is no separate internal manual.

- [English documentation](docs/index.md) / [한국어 문서](docs/index.ko.md)
- [Installation and first connection](docs/installation.md)
- [Configuration](docs/configuration.md) and [settings ownership](docs/settings-reference.md)
- [Architecture](docs/architecture.md) and [development](docs/development.md)
- [UX navigation](docs/ux-navigation.md)

Use Node 24+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm docs:check
# Rendering requires the separate redpact-web checkout; see the development guide.
```

See the [development guide](docs/development.md) for application setup, tests,
packaging and updates. The [Order Desk example](examples/order-desk/README.md)
provides a runnable first Integration check. Local builds and previews do not publish.

## Contributing and license

[Contributing](CONTRIBUTING.md) explains how to get started.
[Agent instructions](AGENTS.md) require documentation updates with behavior changes;
[governance](GOVERNANCE.md) defines official project decision-making.

Copyright 2026 Redpact contributors. Original code and documentation use
[Apache-2.0](LICENSE), unless otherwise noted. Preserve third-party licenses and
notices, including the web assets and vendored components. Contributors retain
copyright; no separate CLA is required. The license permits commercial use but
does not grant rights to the Redpact name or imply official endorsement.

</details>
