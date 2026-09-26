# Redpact

[English](#english) · [한국어](#한국어)

<a id="english"></a>

**Review what your coding agent changed—and the evidence behind it.**

Redpact is a local review tool that brings code changes, test intent, execution
results, and application screenshots together in a web or desktop viewer.

[Demo](https://redpact.dev) · [Documentation](https://redpact.dev/en/docs/) · [Downloads](https://github.com/wo658/redpact/releases) · [Report an issue](https://github.com/wo658/redpact/issues)

[Why Redpact?](#why-redpact) · [How it works](#how-it-works) · [Quick start](#quick-start)

## Why Redpact?

An agent can finish a change and report that tests passed. Reviewing that work
still means finding the diff, reading the assertions, checking the output, and
opening the application. Redpact puts those pieces in one place so you can decide
whether the change meets your request.

| When you want to… | Review in Redpact |
| --- | --- |
| Understand a feature branch | Code changes across local Git worktrees |
| Check what “tests passed” covers | Submitted test intent, assertions, recorded source and results |
| Verify an interaction | Playwright functional results and captured application screens |
| Investigate a failed attempt | Execution logs and environment diagnostics |

Use it alongside Codex or Claude Code while developing locally. The agent writes
code and tests; Redpact manages execution and presents evidence; you review the
result. See the [review walkthrough](docs/review-workflow.md).

## How it works

![Codex or Claude Code handles development. Redpact manages test environments and execution, and presents diffs, test results and screenshots for review.](.github/assets/how-redpact-works.svg)

1. **Develop** with Codex or Claude Code in your project checkout.
2. **Run** tests through Redpact in managed test environments.
3. **Review** changes, submitted test intent, results, and captured application states.
4. **Give feedback** to your agent and repeat.

Passing tests do not establish human acceptance. You decide whether the evidence
covers your request. See the [review workflow](docs/review-workflow.md).

<details>
<summary>Diagram source / 다이어그램 원본</summary>

Download the [editable source](.github/assets/how-redpact-works.excalidraw) and open it in [Excalidraw](https://excalidraw.com).
[편집 원본](.github/assets/how-redpact-works.excalidraw)을 내려받아 [Excalidraw](https://excalidraw.com)에서 열 수 있습니다.

</details>

## What you can review

- **Code changes** — Inspect Git diffs across local worktrees.
- **Test intent and source** — Read what the agent submitted to check the requested behavior.
- **Execution results** — Inspect Unit command output, Vitest Integration results, and Playwright evidence.
- **Application screenshots** — See captured application states alongside the changes being reviewed.

## Quick start

Choose how you want to open Redpact:

| Option | Start here |
| --- | --- |
| Desktop app | [Downloads and platform requirements](docs/installation.md) |
| CLI with a browser viewer | Run the commands below on macOS or Linux |
| Browse the product first | [Demo](https://redpact.dev) |

The CLI path requires
Node.js 24+, npm, curl, and a SHA-256 utility. Managed tests also require Docker
with Compose.

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

Open [the local viewer](http://127.0.0.1:54321) and keep the terminal running.
Save the PATH setting in your shell profile for future terminals.

Next, [connect Codex or Claude Code](docs/installation.md#install-an-agent-plugin),
[configure your project](docs/first-project.md), and [run your first test](docs/first-run.md).
For desktop downloads, Homebrew, other installation options, and platform limits,
see the [installation guide](docs/installation.md).

### Try one review

After connecting your agent and configuring the project, ask it to verify a
specific behavior. For example:

> Use Redpact to verify this quantity change. Valid quantities must update the
> total; invalid quantities must leave the order unchanged. Run meaningful
> integration tests against this checkout, verify the interaction in the real
> app, and capture the initial, updated and error states for review.

In the viewer, select the same project and checkout. Read the submitted assertions,
inspect the execution result, and review the captures before giving feedback.
The [included Order Desk example](docs/first-run.md) provides a guided first run.

### What to know before running

- Each test execution provisions a fresh temporary environment. Recorded evidence
  remains after cleanup; see [execution](docs/execution.md).
- Project settings are shared across worktrees, while application and test paths
  resolve in the selected checkout; see [configuration](docs/configuration.md).
- A passing result applies to the recorded attempt. Submit a new execution after
  changing code or tests; see [reading results](docs/results.md).

## Documentation

- [Install and connect](docs/installation.md)
- [Set up your first project](docs/first-project.md)
- [Run your first test](docs/first-run.md)
- [Read results](docs/results.md)
- [Explore all guides](https://redpact.dev/en/docs/)

## Contributing and license

Start with [Contributing](CONTRIBUTING.md) and the [development guide](docs/development.md).
See [Governance](GOVERNANCE.md) for project decision-making.

Copyright 2026 Redpact contributors. Licensed under [Apache-2.0](LICENSE), unless
otherwise noted. Preserve third-party licenses and notices. Contributors retain
copyright; no separate CLA is required.

---

<a id="한국어"></a>

## 한국어

[English로 이동](#english)

[필요한 이유](#redpact가-필요한-이유) · [동작 방식](#동작-방식) · [빠르게 시작하기](#빠르게-시작하기)

**코딩 에이전트가 무엇을 바꿨는지, 어떤 근거로 확인했는지 검토하세요.**

Redpact는 코드 변경사항, 테스트 의도, 실행 결과와 애플리케이션 스크린샷을
웹 또는 데스크톱 뷰어에서 함께 확인하는 로컬 리뷰 도구입니다.

[데모](https://redpact.dev) · [문서](https://redpact.dev/ko/docs/) · [다운로드](https://github.com/wo658/redpact/releases) · [이슈 제보](https://github.com/wo658/redpact/issues)

## Redpact가 필요한 이유

에이전트가 변경을 마치고 테스트가 통과했다고 보고해도, 검토하려면 diff를 찾고,
assertion을 읽고, 출력을 확인하고, 애플리케이션을 열어야 합니다.
Redpact는 이 자료를 한곳에 모아 변경이 요청한 내용을 충족하는지 판단할 수 있게 합니다.

| 확인하고 싶은 내용 | Redpact에서 보는 자료 |
| --- | --- |
| 기능 브랜치에서 무엇이 바뀌었는가 | 로컬 Git 워크트리별 코드 변경사항 |
| “테스트 통과”가 무엇을 검증했는가 | 제출된 테스트 의도, assertion, 기록된 소스와 결과 |
| 사용자 조작이 제대로 동작하는가 | Playwright 기능 테스트 결과와 실제 앱 화면 캡처 |
| 실행이 왜 실패했는가 | 실행 로그와 환경 진단 |

로컬 개발 중 Codex 또는 Claude Code와 함께 사용합니다. 에이전트가 코드와 테스트를
작성하고, Redpact가 실행을 관리하고 증거를 보여주면, 사용자가 결과를 검토합니다.
[리뷰 예제](docs/review-workflow.ko.md)를 참고하세요.

## 동작 방식

상단 다이어그램은 에이전트 개발부터 실행과 리뷰까지의 흐름을 보여줍니다.

1. **개발** — Codex 또는 Claude Code로 프로젝트 체크아웃에서 작업합니다.
2. **실행** — Redpact의 관리형 테스트 환경에서 테스트를 실행합니다.
3. **검토** — 변경사항, 제출된 테스트 의도, 실행 결과와 캡처된 애플리케이션 상태를 확인합니다.
4. **피드백** — 에이전트에게 수정 의견을 전달하고 반복합니다.

테스트 통과가 사람의 승인을 의미하지는 않습니다. 증거가 요청한 내용을 충분히
검증하는지는 사용자가 판단합니다. [리뷰 흐름](docs/review-workflow.ko.md)을 참고하세요.

## 검토할 수 있는 내용

- **코드 변경사항** — 로컬 워크트리의 Git diff를 확인합니다.
- **테스트 의도와 소스** — 에이전트가 요청한 동작을 확인하기 위해 제출한 테스트를 읽습니다.
- **실행 결과** — Unit 명령 출력, Vitest Integration 결과와 Playwright 증거를 확인합니다.
- **애플리케이션 스크린샷** — 검토 중인 변경사항과 함께 캡처된 애플리케이션 상태를 살펴봅니다.

## 빠르게 시작하기

Redpact를 여는 방법을 선택하세요.

| 방법 | 시작하기 |
| --- | --- |
| 데스크톱 앱 | [다운로드와 플랫폼 요구사항](docs/installation.ko.md) |
| CLI와 브라우저 뷰어 | macOS 또는 Linux에서 아래 명령 실행 |
| 제품 먼저 살펴보기 | [데모](https://redpact.dev) |

CLI 설치에는
Node.js 24 이상, npm, curl과 SHA-256 도구가 필요합니다.
관리형 테스트 실행에는 Docker와 Compose도 필요합니다.

```sh
curl -fsSL https://raw.githubusercontent.com/wo658/redpact/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
redpact serve --port 54321
```

터미널을 실행한 상태로 [로컬 뷰어](http://127.0.0.1:54321)를 엽니다.
이후 터미널에서도 사용할 수 있도록 셸 프로필에 PATH 설정을 추가하세요.

이어서 [Codex 또는 Claude Code를 연결](docs/installation.ko.md)하고,
[프로젝트를 설정](docs/first-project.ko.md)한 뒤 [첫 테스트를 실행](docs/first-run.ko.md)하세요.
데스크톱 다운로드, Homebrew, 다른 설치 방법과 플랫폼별 제한은
[설치 가이드](docs/installation.ko.md)를 참고하세요.

### 리뷰 한 번 해보기

에이전트를 연결하고 프로젝트를 설정한 뒤, 구체적인 동작을 검증하도록 요청하세요.
예를 들면 다음과 같습니다.

> Redpact로 이번 수량 변경을 검증해줘. 유효한 수량은 합계를 갱신하고,
> 잘못된 수량은 기존 주문을 그대로 유지해야 해. 이 체크아웃에서 의미 있는
> 통합 테스트를 실행하고, 실제 앱에서 조작을 검증한 뒤 초기·변경·오류 화면을
> 검토할 수 있도록 캡처해줘.

뷰어에서 같은 프로젝트와 체크아웃을 선택하세요. 제출된 assertion을 읽고,
실행 결과와 캡처를 확인한 뒤 피드백을 전달합니다.
[포함된 Order Desk 예제](docs/first-run.ko.md)로 첫 실행을 따라 해볼 수 있습니다.

### 실행 전에 알아둘 점

- 테스트 실행마다 새로운 임시 환경을 준비합니다. 정리 후에도 기록된 증거는
  남습니다. [실행](docs/execution.ko.md)을 참고하세요.
- 프로젝트 설정은 워크트리가 공유하며, 앱과 테스트 경로는 선택한 체크아웃을
  기준으로 해석합니다. [설정](docs/configuration.ko.md)을 참고하세요.
- 통과 결과는 기록된 시도에 적용됩니다. 코드나 테스트를 바꾸면 새로 실행하세요.
  [결과 읽기](docs/results.ko.md)를 참고하세요.

## 문서 안내

- [설치 및 연결](docs/installation.ko.md)
- [첫 프로젝트 설정](docs/first-project.ko.md)
- [첫 테스트 실행](docs/first-run.ko.md)
- [결과 읽기](docs/results.ko.md)
- [전체 가이드](https://redpact.dev/ko/docs/)

## 기여 및 라이선스

[기여 안내](CONTRIBUTING.md)와 [개발 가이드](docs/development.ko.md)에서 시작하세요.
프로젝트 의사결정 방식은 [거버넌스](GOVERNANCE.md)를 참고하세요.

Copyright 2026 Redpact contributors. 별도 표시가 없는 경우 [Apache-2.0](LICENSE)을
따릅니다. 제3자 라이선스와 고지를 보존해야 합니다.
기여자는 저작권을 유지하며 별도의 CLA는 필요하지 않습니다.
