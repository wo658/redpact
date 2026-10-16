# Redpact

[English](#english) · [한국어](#한국어)

<a id="english"></a>

**Redpact — your development workspace inside GPT.**

Use Redpact as an in-app workspace beside your coding conversation. Open projects,
worktrees, files, Git changes, tests and environments without leaving the app.
The current implementation is a **GPT / Codex App Page Plugin**; it is not
a listing in the public ChatGPT app directory. Supported installation paths are npm/pnpm for the web app and Plugins. Native desktop distribution has ended.

Start with the [in-app setup](docs/installation.md): open Redpact,
choose **Install Redpact** when the runtime is missing, then **Start Redpact**.
The plugin bundles Node, npm and pnpm; managed tests additionally need Docker.

Ask your coding agent to implement a change with TDD in an isolated worktree.
Redpact runs managed Unit, Integration and Playwright verification and records the
inputs, outcomes, source and application screens for review. The conversation and
viewer refer to the same execution; a passing result is separate from current-code
freshness and human acceptance.

[Documentation](https://redpact.dev/en/docs/) · [Installation](docs/installation.md) · [Report an issue](https://github.com/wo658/redpact/issues)

1. [Open Redpact in the app](docs/installation.md) and install/start its local runtime.
2. [Configure your actual project](docs/configuration.md).
3. Ask the agent to write a failing test, implement the behavior and request managed
   checks through MCP. Use subagents for independent work when useful.
4. Open the exact execution review link returned in chat. Inspect the captured
   inputs, evidence and worktree-bound history, then make any required decision.

The full Redpact app keeps project/worktree management, files and diffs, Git, test catalogs, environments and settings in the browser and App Page. Inline MCP Apps provide separate approval and result cards in chat, connected to the same runtime and evidence. Exact execution links open inside the full app.

> Use Redpact to implement quantity editing in a worktree with TDD. Check valid
> persistence and invalid-input rejection, verify the real browser interaction,
> and record desktop and mobile screens. Return the actual execution references
> and remaining review gaps.

Start with the [review walkthrough](docs/review-workflow.md), [results](docs/results.md) and [MCP contracts](docs/interfaces.md).
The App Page package includes the development/setup skills and connects its viewer
and model tools to one runtime; its installation and host limitations are documented
in the [installation guide](docs/installation.md).

## Contributing

Read [CONTRIBUTING](CONTRIBUTING.md), [development](docs/development.md) and
[governance](GOVERNANCE.md). Product and implementation documentation is maintained
in English and Korean under `docs/`.

Copyright 2026 Redpact contributors. Licensed under [Apache-2.0](LICENSE), unless
otherwise noted. Preserve third-party licenses and notices. Contributors retain
copyright; no separate CLA is required.

---

<a id="한국어"></a>

**Redpact — GPT 안에서 사용하는 개발 작업공간.**

코딩 대화 옆에서 Redpact 앱을 열고 프로젝트·워크트리·파일·Git 변경·테스트·환경을
관리하세요. 현재 구현은 **GPT / Codex App Page Plugin**이며, 공개 ChatGPT
앱 디렉터리에 등록된 앱은 아닙니다. npm/pnpm 웹 앱과 Plugin 설치를 지원하며 네이티브 데스크톱 배포는 종료했습니다.

[앱에서 시작하기](docs/installation.ko.md): Redpact를 열고 런타임이
없으면 **Install Redpact**, 설치 후에는 **Start Redpact**를 누르세요.
플러그인은 Node·npm·pnpm을 포함하며, 관리형 테스트에는 Docker가 추가로 필요합니다.

코딩 에이전트에게 격리된 워크트리에서 TDD로 변경을 구현하도록 요청하세요.
Redpact는 Unit·Integration·Playwright 관리형 검증을 실행하고 입력, 결과, 소스와
애플리케이션 화면을 기록합니다. 대화와 뷰어가 같은 실행을 가리키며, 통과 결과는
현재 코드의 최신성이나 사람의 수락과 구분됩니다.

[문서](https://redpact.dev/ko/docs/) · [설치](docs/installation.ko.md) · [이슈 제보](https://github.com/wo658/redpact/issues)

1. [앱에서 Redpact를 열고](docs/installation.ko.md) 로컬 런타임을 설치·시작합니다.
2. [실제 프로젝트를 설정](docs/configuration.ko.md)합니다.
3. 에이전트에게 실패하는 테스트를 먼저 확인하고 구현한 뒤 MCP로 관리형 검증을
   요청하게 합니다. 독립적인 작업은 필요에 따라 하위 에이전트가 나눠 맡습니다.
4. 채팅에서 반환된 정확한 실행 검토 링크를 엽니다. 캡처된 입력·근거·워크트리별
   이력을 확인하고 필요한 결정을 내립니다.

전체 Redpact 앱은 브라우저·App Page에서 프로젝트·워크트리 관리, 파일·diff, Git, 테스트 카탈로그, 환경·설정을 제공합니다. 채팅 인라인 MCP Apps는 같은 런타임과 근거를 사용하는 별도의 승인·결과 카드입니다. 정확한 실행 링크도 전체 앱 안에서 열립니다.

> Redpact를 사용해서 워크트리에서 TDD로 수량 편집을 구현해줘. 정상 저장과 잘못된
> 입력 거부, 실제 브라우저 조작을 검증하고 데스크톱·모바일 화면을 기록해.
> 실제 실행 참조와 검토가 남은 부분을 알려줘.

[검토 절차](docs/review-workflow.ko.md),
[결과](docs/results.ko.md), [MCP 계약](docs/interfaces.ko.md)을 참고하세요.
App Page 패키지는 개발·설정 스킬을 포함하고 뷰어와 모델 도구를 같은 런타임으로
연결합니다. 설치와 호스트 제약은 [설치 안내](docs/installation.ko.md)에 설명합니다.

## 기여

[기여 안내](CONTRIBUTING.md), [개발 문서](docs/development.ko.md),
[거버넌스](GOVERNANCE.md)를 읽어주세요. 제품·구현 문서는 `docs/`에서 영문·한국어로
함께 유지합니다.

Copyright 2026 Redpact contributors. 별도 표시가 없는 한 [Apache-2.0](LICENSE)을
따릅니다. 제3자 라이선스와 고지를 보존하세요. 기여자는 저작권을 유지하며 별도 CLA는
요구하지 않습니다.
