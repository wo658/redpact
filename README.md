# Redpact

[English](#english) · [한국어](#한국어)

<a id="english"></a>

**Develop in chat. Review the evidence with Redpact.**

Ask your coding agent to implement a change with TDD in an isolated worktree.
Redpact runs managed Unit, Integration and Playwright verification and records the
inputs, outcomes, source and application screens for review. The conversation and
viewer refer to the same execution; a passing result is separate from current-code
freshness and human acceptance.

[Documentation](https://redpact.dev/en/docs/) · [Downloads](https://github.com/wo658/redpact/releases) · [Report an issue](https://github.com/wo658/redpact/issues)

1. [Install and connect](docs/installation.md) the runtime and agent plugin.
2. [Configure your actual project](docs/first-project.md).
3. Ask the agent to write a failing test, implement the behavior and request managed
   checks through MCP. Use subagents for independent work when useful.
4. Open **Current work**, **Execution history** or the returned execution review
   link to inspect the evidence and make any required decision.

The host agent handles files, worktrees and Git. Redpact focuses on execution,
approval and evidence; the review viewer has no generic file browser, Git Graph,
Git mutation toolbar or independent task tabs.

> Use Redpact to implement quantity editing in a worktree with TDD. Check valid
> persistence and invalid-input rejection, verify the real browser interaction,
> and record desktop and mobile screens. Return the actual execution references
> and remaining review gaps.

Start with the [review walkthrough](docs/review-workflow.md), [first managed
execution](docs/first-run.md), [results](docs/results.md) and [MCP contracts](docs/interfaces.md).
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

**채팅으로 개발하고, Redpact로 근거를 검토하세요.**

코딩 에이전트에게 격리된 워크트리에서 TDD로 변경을 구현하도록 요청하세요.
Redpact는 Unit·Integration·Playwright 관리형 검증을 실행하고 입력, 결과, 소스와
애플리케이션 화면을 기록합니다. 대화와 뷰어가 같은 실행을 가리키며, 통과 결과는
현재 코드의 최신성이나 사람의 수락과 구분됩니다.

[문서](https://redpact.dev/ko/docs/) · [다운로드](https://github.com/wo658/redpact/releases) · [이슈 제보](https://github.com/wo658/redpact/issues)

1. 런타임과 에이전트 플러그인을 [설치·연결](docs/installation.ko.md)합니다.
2. [실제 프로젝트를 설정](docs/first-project.ko.md)합니다.
3. 에이전트에게 실패하는 테스트를 먼저 확인하고 구현한 뒤 MCP로 관리형 검증을
   요청하게 합니다. 독립적인 작업은 필요에 따라 하위 에이전트가 나눠 맡습니다.
4. **현재 작업**, **실행 이력** 또는 반환된 실행 검토 링크에서 근거를 확인하고
   필요한 결정을 내립니다.

호스트 에이전트가 파일·워크트리·Git 작업을 맡습니다. Redpact는 실행·승인·근거에
집중하며 일반 파일 탐색기, Git Graph, Git 변경 툴바나 독립 작업 탭을 두지 않습니다.

> Redpact를 사용해서 워크트리에서 TDD로 수량 편집을 구현해줘. 정상 저장과 잘못된
> 입력 거부, 실제 브라우저 조작을 검증하고 데스크톱·모바일 화면을 기록해.
> 실제 실행 참조와 검토가 남은 부분을 알려줘.

[검토 절차](docs/review-workflow.ko.md), [첫 관리형 실행](docs/first-run.ko.md),
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
