---
title: 설치와 에이전트 연결
description: Redpact 인앱 작업공간으로 시작하거나 npm·pnpm으로 독립 런타임을 설치하고 업데이트합니다.
---

# 설치와 에이전트 연결

Redpact의 공개 소스와 런타임 다운로드는
[wo658/redpact](https://github.com/wo658/redpact)에서 제공합니다. 런타임 패키지는
CLI와 브라우저 뷰어를 설치합니다.

## 앱에서 시작하기

Redpact의 주 사용 방식은 GPT 대화 옆의 전체 개발 작업공간입니다. 지원하는 GPT / Codex 호스트의 **Apps in sidebar**에서 Redpact를 열고
npm/pnpm 설치까지 이어갑니다. 현재 App Page Plugin은 macOS Apple Silicon용입니다. 공개 ChatGPT 앱
디렉터리 배포나 다른 호스트 지원을 의미하지 않습니다.

1. 아래 공개 Plugin을 설치합니다.
2. **Apps in sidebar**에서 **Redpact**를 엽니다.
3. 런타임이 없으면 **Install Redpact**를 누릅니다. 설치 옵션에서 npm 또는 pnpm을 선택할 수 있습니다.
4. **Start Redpact**를 누르고 프로젝트를 연결합니다. 실행 중이면 전체 앱이 바로 열립니다.

페이지를 열거나 다시 연결하는 것만으로 설치·시작하지 않습니다. Node·npm·pnpm은
플러그인에 포함됩니다. 아래 전역 설치 명령은 별도 브라우저·CLI 런타임용이며,
플러그인 관리 설치본을 업데이트하거나 플러그인을 설치하는 명령이 아닙니다.

## 설치 경로 선택

| 경로 | 제공 내용 | 요구 사항 |
| --- | --- | --- |
| npm / pnpm | CLI와 전체 웹 앱 | Node 24+, npm 또는 pnpm |
| GPT / Codex App Page Plugin | 사이드바 앱, 런타임 설치·실행, 개발 스킬 | 현재 macOS Apple Silicon, Plugin 설치용 npm과 지원 호스트 |
| 다른 에이전트 Plugin | 스킬과 HTTP MCP 연결 | npm/pnpm으로 설치하고 실행한 런타임 |

네이티브 Windows·Linux·macOS 데스크톱 앱, Homebrew, 셸 설치기는 더 이상 배포하지 않습니다.
기존 릴리스는 과거 자료이며 새 설치 경로가 아닙니다. 소스 빌드는 기여자 검증용입니다.
관리형 테스트에는 Docker Compose가 필요합니다. 웹 런타임 CI 검증 범위는
[개발 문서](development.md)를 참고하세요.

## 소스에서 번들 런타임 설치

Node.js 24 이상, pnpm, Git을 설치한 뒤 서버와 뷰어를 함께 포함하는 패키지를 빌드하세요.

```sh
git clone https://github.com/wo658/redpact.git
cd redpact
pnpm install --frozen-lockfile
pnpm pack:runtime
redpact_version=$(node -p "require('./app/server/package.json').version")
pnpm add --global "./dist/redpact-${redpact_version}.tgz"
redpact serve --project /absolute/path/to/your-project
```

프로젝트 경로를 자신의 체크아웃 경로로 바꾸세요. 명령은 현재 체크아웃에서 패키지 버전을 읽으며, `pnpm pack:runtime`도 생성한 tarball 경로를 출력합니다. pnpm 전역 실행 파일 디렉터리가 없다는 오류가 나면 `pnpm setup`을 실행하고 터미널을 다시 연 뒤 Redpact 체크아웃에서 전역 설치를 재시도하세요.

번들 뷰어는 `http://127.0.0.1:54318`에서 열고, 에이전트는 `http://127.0.0.1:54318/mcp`에 연결하세요. 서버를 실행 상태로 유지하고 종료하려면 Ctrl+C를 누르세요. 이 명령은 CLI와 웹 뷰어를 설치합니다. 관리형 테스트에는 사전 준비 항목에 설명한 Docker와 Compose가 필요합니다.

## npm 또는 pnpm으로 설치·업데이트

Node.js 24 이상에서 다음 중 사용하는 패키지 관리자의 명령을 실행하세요.
같은 명령으로 기존 전역 설치본을 최신 공개 버전으로 업데이트할 수 있습니다.

```sh
npm install --global @wo658/redpact@latest
# 또는:
pnpm add --global @wo658/redpact@latest
redpact serve --port 54321
```

전역 설치 없이 실행하려면 다음 중 하나를 사용하세요.

```sh
npx @wo658/redpact@latest serve --port 54321
# 또는:
pnpm dlx @wo658/redpact@latest serve --port 54321
```

업데이트 전 진행 중인 작업을 마치고 해당 런타임을 종료한 뒤 다시 시작하세요.
사용자에게 쓰기 권한이 있는 전역 디렉터리를 사용합니다. pnpm 전역 실행 경로가 없으면
`pnpm setup` 후 터미널을 다시 여세요. 실행 명령은 `redpact`입니다.
2026-10-13 확인 기준 npm `latest`는 `0.8.0`이며, GitHub `main`의 미발행 변경을 포함하지 않습니다.

### GitHub 릴리스 tarball

특정 버전이 필요하면 [릴리스](https://github.com/wo658/redpact/releases)에서 해당
패키지와 체크섬을 확인하세요. 오래된 `runtime-v0.1.0`은 과거 릴리스이며 최신 설치 경로가 아닙니다.
소스의 현재 변경이 필요하면 위의 소스 패키지 빌드 절차를 사용하세요.

## 에이전트 플러그인 설치

GPT / Codex의 공개 카탈로그는 npm 패키지 `@wo658/redpact-plugin`을 사용합니다.
Plugin 설치 시 호스트가 npm을 사용하므로 npm이 설치되어 있어야 합니다.

```sh
codex plugin marketplace add wo658/redpact
codex plugin add redpact@redpact
```

호스트를 다시 시작하고 **Apps in sidebar → Redpact**를 엽니다.
**Install Redpact**에서 npm/pnpm을 선택하고, 설치 후 **Start Redpact**를 누르세요.
Plugin이 Node·npm·pnpm을 포함하므로 앱 안의 런타임 설치에는 별도 도구 설정이 필요 없습니다.
공개 ChatGPT Plugin 디렉터리의 심사·등재를 의미하지 않습니다.

다른 에이전트는 먼저 `redpact serve --port 54321`을 실행하고 유지하세요.
뷰어 주소는 `http://127.0.0.1:54321`입니다.

Claude Code:

```sh
claude plugin marketplace add wo658/redpact
claude plugin install redpact@redpact
```

새 세션에서 `/redpact:redpact-init` 또는 `/redpact:redpact`를 사용하세요.
Claude Code 카탈로그는 공개 GitHub 저장소의 HTTP Plugin을 설치합니다.
이 Plugin은 런타임을 설치·실행하지 않습니다. 어떤 Plugin도 Docker 설치나 테스트 승인을 대신하지 않습니다.
프로젝트가 호스팅하는 카탈로그이며 OpenAI나 Anthropic의 공식 추천 목록 등재를
의미하지 않습니다.

### 다른 에이전트의 마켓플레이스

공개 저장소 `https://github.com/wo658/redpact`가 마켓플레이스 배포처입니다.
각 클라이언트는 자체 카탈로그를 읽으며 모든 에이전트에 공통인 등록 명령은 없습니다.
마켓플레이스 등록과 Redpact 플러그인 설치는 별개입니다. 기존 `redpact@personal`은
자동으로 이전되지 않습니다. 원격 설치본을 사용하기 전에 해당 클라이언트에서 중복
설치를 비활성화하거나 제거하세요.

GitHub Copilot CLI는 기존 Claude 형식의 카탈로그와 매니페스트를 지원합니다.

```sh
copilot plugin marketplace add wo658/redpact
copilot plugin install redpact@redpact
```

`plugin` 명령을 지원하는 GitHub Copilot CLI가 필요하며, 이름이 `copilot`인 다른
실행 파일과는 구분해야 합니다. 이 호환성은
[Copilot 플러그인 문서](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)에
정의되어 있습니다. 이 프로젝트에서는 Copilot 설치를 아직 검증하지 않았습니다.

Cursor용 `.cursor-plugin/marketplace.json` 카탈로그도 저장소에 제공합니다.
Redpact 매니페스트는 스킬 내용을 복제하지 않고 동일한 스킬과 MCP 설정을 참조합니다.
Cursor 팀 마켓플레이스 설정 시 이 GitHub 저장소를 사용하세요. 공개 Cursor Marketplace
목록에 노출되려면 별도의 제출과 심사가 필요하며, 저장소 제공 자체가 등록 승인을 뜻하지는
않습니다. [Cursor 플러그인 문서](https://cursor.com/docs/reference/plugins)를 참고하세요.
Cursor 설치는 아직 검증하지 않았습니다.

Gemini CLI는 이 마켓플레이스 카탈로그 대신 `gemini-extension.json`이 포함된 GitHub
확장을 사용합니다. 이 저장소는 현재 Gemini 확장 패키지를 제공하지 않습니다.
다른 MCP 지원 클라이언트는 아래 방식으로 직접 연결할 수 있습니다. Redpact 앱의
플러그인 업데이트 기능은 현재 Codex와 Claude Code만 지원하며, 다른 클라이언트의
플러그인은 해당 클라이언트에서 관리합니다.

HTTP 플러그인은 `http://127.0.0.1:54321/mcp`, App Page Plugin은 54322 포트를 사용합니다. 다른 인스턴스를 쓰려면
플러그인이 자동으로 따라간다고 가정하지 말고 실제 포트로 HTTP MCP를 직접 연결하세요.
다른 클라이언트도 이 연결을 사용할 수 있으나 검증된 플러그인 통합으로 주장하지 않습니다.
도구 확인에는 에이전트에게 `configure describe` 호출을 요청하세요.
실행 승인은 연결된 웹 검토 화면에서 합니다. MCP는 채팅 인라인 카드 없이 검토
경로를 반환하며 승인 화면을 사용할 수 없다고 승인 절차를 우회해서는 안 됩니다.
[인터페이스 계약](interfaces.md)을 참고하세요.

## App Page Plugin 패키징과 동작

[Redpact App](../examples/sidebar-app/README.md)은 독립적인 로컬 STDIO MCP App Page입니다.
macOS arm64 부트스트랩에 공식 Node 26.0.0, npm, pnpm 11.2.2와 라이선스를 포함하지만
**Redpact 서버는 포함하지 않습니다**. Redpact 설치 전에도 페이지가 열립니다.
사용자가 Node, npm, pnpm 또는 Redpact를 따로 설치할 필요는 없습니다. 런타임 설치에는
공개 npm 레지스트리 네트워크 접근이 필요합니다. Docker와 프로젝트별 실행 도구는
해당 기능이 필요로 할 때 별도 전제 조건으로 남습니다.

부트스트랩을 빌드하는 기여자는 Node, pnpm과 루트에서 `pnpm install --frozen-lockfile`로
설치한 워크스페이스 의존성이 필요합니다. 플러그인은 기존 `app/web` 뷰어를 상대 자산
경로로 빌드해 포함합니다. 저장소 루트에서 실행합니다.

```sh
cd examples/sidebar-app
pnpm install --frozen-lockfile
pnpm bundle:redpact
codex plugin marketplace add "$PWD/dist/redpact-marketplace"
codex plugin add redpact@redpact
```

`bundle:redpact`는 공식 Node 아카이브를 릴리스 SHA-256 목록과 대조하고 그 안의
npm 배포본 및 고정 버전 pnpm CLI를 플러그인에 포함합니다. 이후 `pnpm build`는
도구를 다시 다운로드하지 않고 앱과 페이지를 빌드합니다. portable `plugin.json`과
`mcp.json`을 사용하며 내부 명령 경로와 `${PLUGIN_ROOT}`는 소스 저장소가 아닌 설치된
플러그인 복사본을 기준으로 해석됩니다. Windows, Linux, macOS Intel 배포본은 아직
패키징하지 않았습니다.

작업을 저장하고 Codex를 재시작한 뒤 Global Apps에서 **Redpact**를 찾습니다.
`open_redpact_app`은 `global`과 `thread` 진입점을 선언합니다. 실제 노출은 호스트에서
확인해야 하며 브라우저 검증 호스트만으로 증명할 수 없습니다.

플러그인 관리 런타임이 없으면 **Install Redpact**와 **npm / pnpm** 선택기가 나타납니다.
명시적으로 눌러야 설치하며 페이지 열기나 새로고침은 설치를 시작하지 않습니다.
선택한 번들 패키지 매니저로 공개 패키지 `@wo658/redpact@0.8.0`을 설치하며 라이프사이클
스크립트는 실행하지 않습니다. 설치 중에는 진행 상태를 주기적으로 읽습니다. 실패를
표시하고 버튼으로 재시도할 수 있으며 상세 기록은 `install.log`에 남깁니다.
임의의 패키지 이름, 레지스트리 또는 명령은 입력할 수 없습니다.

설치 결과는 `~/.redpact/app-page/packages/0.8.0-npm` 또는
`~/.redpact/app-page/packages/0.8.0-pnpm`에 저장합니다. 기본 선택은 pnpm입니다.
검증된 기존 설치가 있으면 재사용하며 두 가지가 모두 있으면 npm을 먼저 선택합니다.
이 탐지는 플러그인 관리 패키지만 대상으로 하며 다른 전역 설치나 데스크톱 앱은
탐색하지 않습니다. 임시 디렉터리에 설치한 후 패키지 버전, 진입점, 뷰어를 확인해야
완료 디렉터리로 이동합니다. 전역 PATH·전역 패키지·프로젝트 의존성을 바꾸지 않습니다.
MCP 프로세스의 `REDPACT_APP_INSTALL_DIR`로 패키지 루트를 변경할 수 있습니다.

플러그인을 열거나 MCP 세션을 다시 연결할 때는 런타임 상태만 확인하며 Redpact를
자동으로 설치하거나 시작하지 않습니다. 관리 대상 패키지가 없으면 **Install Redpact**,
설치되어 있지만 중지되어 있으면 **Start Redpact**를 표시합니다. 호스트를 재시작해도
같습니다. 정상 실행 중인 서버는 재사용하고, 알 수 없는 서비스가 포트를 사용하면
시작을 차단합니다. 상태 조회는 명시적으로 중지한 런타임을 다시 실행하지 않습니다.

시작 화면의 **Start Redpact**는 설치 전에는 숨깁니다. 실행 중에는 공유 웹
뷰어가 앱 전체 영역을 채우며 플러그인 상단바나 추가 탐색 메뉴를 표시하지 않습니다.
연결 또는 뷰어 오류가 발생한 경우에만 **Refresh**, **Open local viewer**와 런타임 복구
버튼을 표시합니다. 호스트는 비공개 앱 전용 MCP 중지 도구를 계속 사용할 수 있습니다.
시작은 테스트 실행이나 컨테이너 생성을 수행하지 않습니다. Stop은
기존 비공개 부모 IPC 채널을 사용하고 소유 런타임의 진행 중 작업을 중단할 수 있지만
저장된 증거는 보존합니다. 같은 포트의 외부 서버를 조회할 수는 있어도 다른 플러그인
세션이 중지할 수는 없습니다. 알 수 없는 서버가 포트를 점유하면 시작을 차단합니다.
시작·중지는 순서대로 처리합니다.

플러그인은 사이드바와 같은 런타임·증거 저장소의
App 패키지는 일반 플러그인과 같은 `redpact`, `redpact-init` 스킬을 포함하며 MCP 의존성을
이 App 인스턴스로 연결합니다. 빌드는 유지되는 스킬 원본을 표준 `skills/` 디렉터리로
복사하고 연결 메타데이터만 조정합니다. 별도의 스킬 사본을 유지하지 않습니다.

`http://127.0.0.1:54322/mcp`에 별도 `redpact-verification` HTTP MCP 연결도 등록합니다.
런타임의 모델 도구를 직접 노출해 웹 검토 경로와 승인 경계를 유지하며 App 전용 뷰어
브리지는 비공개로 유지합니다. 검증 계약은 [MCP 인터페이스](interfaces.md)를 참고하세요.
번들 설치기는 여전히 이전 도구 구성을 가진 공개 0.8.0을 다운로드합니다. 확장된 검증 도구는
이 소스로 빌드한 런타임이나 이를 포함하는 후속 릴리스가 필요합니다.
런타임 시작·업데이트 후 도구 목록이 오래되었거나 시작 시 연결하지 못했다면 호스트의 MCP
연결을 다시 연결하세요. `REDPACT_APP_PORT`를 변경하면 플러그인 manifest의 HTTP MCP URL도
함께 변경해야 합니다.

기본 포트는 `54322`, 런타임 데이터는 `~/.redpact/app-page/54322`, 시작 출력은 그 안의
`app-start.log`에 저장합니다. `REDPACT_APP_PORT`와 `REDPACT_APP_DATA_DIR`로 변경할
수 있습니다. 패키지 파일과 실행 증거는 분리됩니다. 뷰어의 런타임 업데이트 요청에는
App 설치기가 업데이트를 관리한다고 알리며 페이지 뒤에서 독립 npm 자체 업데이트를
수행하지 않습니다.

설치·시작 전에는 해당 설정 화면을 표시합니다. 정상 런타임은 프로젝트·워크트리·파일·diff·Git·테스트·환경·설정을 포함한 전체 앱을 표시합니다. 기록 없이도 일반 프로젝트 탐색이나 프로젝트 연결을 사용할 수 있습니다. `open_redpact_app`은 `kind`와 UUID `id` 쌍으로 앱 안의 정확한 요청이나 실행을 열 수도 있으며 실행 요청이나 승인을 하지 않습니다. App은 UI 메타데이터의 로컬 정규 검토 경로만 허용합니다. 상태 조회는 선택을 유지하며 복구용 **Open local viewer**도 같은 기록을 엽니다. 채팅 인라인 승인·결과 카드는 제공하지 않습니다.

App 리소스에 기존 React 뷰어와 스타일·폰트·아이콘을 직접 포함합니다.
URI에 번들 HTML의 해시를 포함하므로 플러그인을 업데이트하면 이전 빌드의 캐시된
화면을 재사용하지 않습니다. 미리보기 클라이언트는 열기 도구에서 이 URI를 조회합니다. 중첩 iframe,
브라우저 HTTP 연결 또는 루프백 CSP 예외를 요구하지 않습니다. Codex는 리소스에
루프백 출처를 선언해도 HTTP 프레임을 차단할 수 있으므로 지원되는 MCP Apps 도구
연결을 사용합니다.

API 요청은 앱 전용 접근 권한을 검증하는 도구를 통해 고정 로컬 런타임으로 전달합니다.
임의 출처·API 외 경로·리디렉션을 거부하며 브라우저 쿠키나 인증 헤더를 전달하지
않습니다. 뷰어의 GET/POST/PUT/PATCH/DELETE 요청을 지원합니다. JSON 요청 본문은
텍스트 1 MiB, 응답은 16 MiB로 제한하며 더 큰 결과물은 독립 뷰어에서 열어야 합니다.
캡처 이미지는 data URL로 표시하여 `blob:` 이미지 주소를 허용하지 않는 호스트에서도
볼 수 있습니다. 그 밖의 바이너리 첨부물은 로컬 blob URL을 사용하고 화면을 닫으면
URL을 해제합니다. 이미지 요청이나 디코딩에 실패하면 깨진 이미지 아이콘 대신
첨부물 이름과 진단을 표시합니다.
런타임의 Host·Origin·Fetch Metadata 검사는 변경하지 않습니다.

컴패니언은 실제 범위별 SSE 구독을 유지하고 App은 변경 번호와 오류 상태를 1초마다
조회합니다. 화면에서 범위가 사라지면 구독을 닫으며 방치된 구독은 30초 후 만료하고
MCP 연결 종료 시 모든 구독을 닫습니다. 외부 화면은 5초마다 런타임 상태를 확인하고
설치 진행 중에는 1초마다 확인합니다. 서버가 중지되거나 비정상이면 시작 화면으로
돌아가며 자동 설치·재시작·테스트 실행은 하지 않습니다. 연결 오류가 나면 **Refresh**와
**Open local viewer**를 표시하며 후자는 설치 패키지의 독립 뷰어를 엽니다.
정상 서버나 테스트 통과는 변경 수락을 의미하지 않습니다.

페이지를 닫는 것만으로 MCP 세션을 닫지 않습니다. 소유 MCP 세션이 끊기면 자식 런타임을
종료하고 진행 중 패키지 설치를 취소합니다. 이후 세션은 설치 패키지와 저장 데이터를
재사용합니다. `codex plugin remove redpact-app@redpact-app-local`로 앱 플러그인을 제거하며
활성 세션의 소유 프로세스를 멈추려면 해당 연결을 먼저 종료해야 합니다. 플러그인 제거는
관리 패키지 경로와 런타임 데이터를 보존합니다. 별도 전역 Redpact를 제거하거나 데스크톱
앱을 휴지통으로 옮겨도 런타임 데이터는 그대로 남습니다.

검증에는 Playwright Chromium(`pnpm exec playwright install chromium`)을 설치하고
`pnpm typecheck`, `pnpm test`를 실행합니다. 현재 서버·뷰어와 이 보조 앱을 빌드한 뒤
`pnpm test:browser`로 실제 MCP 브리지를 통한 소스 빌드 런타임을 확인합니다. 전체 앱 진입,
프로젝트 탐색, 정확한 요청 열기, 이력, 반응형 레이아웃과 명시적인 웹 승인 경계를 검증합니다. 공개 패키지 설치는
별도 검사입니다. `REDPACT_TEST_RUNTIME=installed REDPACT_TEST_MANAGER=npm pnpm test:browser`
(매니저는 `pnpm`도 가능)는 설치와 소유 수명주기를 검증하며 현재 소스 뷰어의 동작을
증명하지 않습니다. 설치기는 여전히 공개 0.8.0을 고정합니다.

산출물과 로그는 `dist/redpact-evidence/`에 둡니다. `pnpm preview`는
`http://127.0.0.1:4320`에서 로컬 검증 호스트를 시작합니다. 어느 검사도 실제 Codex의
Global Apps 탐색·호스트 렌더링·사람의 코드 수락을 증명하지 않습니다. 프로젝트의
관리형 인수 검증은 이 보조 앱 검사와 별개입니다.

설정 화면은 현재 상태에 맞는 주요 동작 하나를 표시합니다. 설치 전에는 **Install Redpact**,
설치 중에는 **Installing…**, 설치 후 중지 상태에서는 **Start Redpact**를 표시합니다.
설치 실패 시 진단 내용과 **Try again** 버튼을 표시합니다. **Installation options**를
펼치면 패키지 매니저 선택과 설치 경로를, **Connection details**를 펼치면 연결 주소,
런타임 데이터 디렉터리와 시작 로그를 확인할 수 있습니다. 사용할 수 없는 시작·중지 버튼은
숨기고, 연결 실패 시 새로고침과 복구 버튼을 표시합니다. 설정 화면은 호스트의 밝은·어두운
테마를 따르며 좁은 App 패널에서도 재배치됩니다.

설치 전과 중지 화면은 두 테마 모두 중앙의 로고, 짧은 상태 제목과 주요 동작으로 통일합니다. 홍보성 설명, 반복 브랜드와 하단 문구를 표시하지 않으며, 연결·설치 오류의 진단 정보는 필요할 때 제공합니다.

## 에이전트 플러그인 업데이트

npm 소스의 공개 App Page Plugin은 호스트의 Plugin 관리 화면 또는
`codex plugin marketplace upgrade redpact` 후 `codex plugin add redpact@redpact`로
업데이트하세요. 아래 런타임 내 업데이트 화면은 경로 기반 HTTP Plugin만 지원하며
npm 소스 버전을 비교하지 않습니다.


설정 → 에이전트 플러그인에서 Codex와 Claude Code에 설치된 Redpact 플러그인을
확인합니다. 실행 파일 자동 탐지가 실패하면 인스턴스 설정의 **Codex CLI 경로** 또는
**Claude Code CLI 경로**에 인수 없는 절대 실행 파일 경로를 입력하고 저장하세요.
빈 경로는 PATH와 일반적인 로컬 설치 디렉터리를 사용합니다. CLI는 브라우저 사용자가
아닌 Redpact 서버 호스트의 OS 사용자로 실행됩니다. 다른 에이전트는 아직 지원하지 않습니다.

**플러그인 업데이트 확인**은 각 에이전트의 설치 목록과 마켓플레이스 JSON을 읽습니다.
개인·로컬 마켓플레이스를 포함해 설치된 `redpact@<marketplace>`를 따르며, 공식
마켓플레이스로 변경하지 않습니다. 활성화된 사용자 범위 설치 한 개가 필요합니다.
비활성 플러그인, 다른 설치 범위와 다중 설치는 해당 에이전트에서 관리해야 합니다.
CLI 없음, 불완전한 출력, 알 수 없는 버전, 갱신 실패는 명시적인 오류로 표시합니다.

원격 마켓플레이스는 에이전트 CLI로 해당 마켓플레이스만 갱신합니다.
Codex Git 마켓플레이스는 `plugin marketplace upgrade <marketplace>`, Claude Code
원격 마켓플레이스는 `plugin marketplace update <marketplace>`를 사용합니다.
로컬 마켓플레이스는 직접 읽습니다. 마켓플레이스 카탈로그에서 플러그인 디렉터리를
찾고 에이전트별 매니페스트에서 배포 버전을 읽습니다. Git 마켓플레이스 안의 항목을
포함해 Codex의 로컬 경로 항목과 Claude Code의 상대 디렉터리 항목을 지원합니다.
별도의 원격 플러그인 저장소를 가리키는 항목은 아직 지원하지 않으며 에이전트에서 관리해야 합니다.

앱의 GitHub Release 버전이나 앱·플러그인 호환성은 비교하지 않습니다.
더 높은 안정 SemVer일 때만 **업데이트**를 표시합니다. 빌드 메타데이터만 다른 경우는
새 버전으로 보지 않습니다. 다만 Codex 재설치 형식인 `X.Y.Z+codex.YYYYMMDDhhmmss`는
예외로, 기본 버전이 같고 시간표시가 더 최신이면 업데이트를 제공합니다. 이미 더 높은
버전이 설치되어 있으면 내리지 않습니다.
배포자는 변경을 배포할 때 플러그인 매니페스트 버전을 올려야 합니다.
확인은 수동이며 일반 상태 폴링은 CLI를 실행하지 않고 마지막 메모리 결과만 읽습니다.
Redpact를 다시 시작하면 확인 결과가 초기화됩니다.

**업데이트**는 표시된 에이전트·버전을 확인하는 대화상자를 엽니다. Redpact는 저장된
CLI 경로, 설치 버전, 마켓플레이스 출처와 배포 버전을 다시 확인합니다.
Codex는 `plugin add redpact@<marketplace> --json`, Claude Code는
`plugin update redpact@<marketplace> --scope user`로 설치합니다. 마켓플레이스 이름은
검증된 설치 식별자에서 가져오며 셸 명령을 입력받지 않습니다. 각 CLI 명령의 제한
시간은 2분이며 한 인스턴스에서는 확인과 설치가 동시에 실행되지 않습니다.

요청한 설치 버전을 다시 읽어 확인해야 성공입니다. 이후 새 에이전트 세션을 시작하세요.
디스크 설치만으로 기존 대화가 갱신되지는 않으며 Redpact 자체는 재시작하지 않습니다.
CLI의 대화형 승인 필요, 설치 실패, 후보 버전 변경은 오류로 표시하며 다시 확인해야 합니다.
자동 롤백은 제공하지 않습니다. 다른 클라이언트에서 같은 플러그인을 동시에 업데이트하지 마세요.

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

CLI의 기본 포트는 `54318`입니다. 시작 로그의 `url` 필드에 `http://127.0.0.1:54318/` 같은 뷰어 주소가 표시되며, 그 주소로 바로 접속할 수 있습니다. `--port`를 지정하면 해당 실행에 한해 인스턴스 설정을 덮어씁니다. 포트가 사용 중이면 시작에 실패합니다. Redpact는 루프백에 바인딩하며 API 토큰을 요구하지 않습니다. 공개 노출을 전제로 한 서비스가 아닌 로컬 애플리케이션입니다.

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

| 구성 요소 | 소스 실행 예시 | App Page Plugin |
|---|---|---|
| Redpact API | `http://127.0.0.1:54318` | `http://127.0.0.1:54322` |
| 에이전트 MCP 주소 | `http://127.0.0.1:54318/mcp` | `http://127.0.0.1:54322/mcp` |
| 뷰어 | 위 API로 프록시하는 Vite 주소 | 사이드바의 전체 웹 앱 |
| 실행 이력 | `--data-dir`로 지정한 디렉터리 | Plugin 인스턴스의 데이터 디렉터리 |

`4310` 포트의 공개 문서 프리뷰는 별도의 읽기용 사이트입니다. 프로젝트 뷰어나 MCP 주소를 제공하지 않습니다. 문서 페이지가 열린다고 실행 서버가 동작 중인 것은 아닙니다.

재시작 후에도 같은 이력을 보려면 소스 서버의 데이터 디렉터리를 유지하세요. 같은 디렉터리로 다른 서버를 시작하기 전에 기존 프로세스를 종료해야 합니다. 네트워크 포트가 같아도 새 빈 디렉터리로 시작하면 다른 인스턴스 상태를 보게 됩니다.

## 에이전트 연결

에이전트 클라이언트에 다음 주소로 Streamable HTTP MCP 연결을 추가하세요.

```text
http://127.0.0.1:54318/mcp
```

설정 문법은 클라이언트마다 다릅니다. 클라이언트의 HTTP MCP 연결 기능을 사용하세요. Redpact는 이 흐름을 위한 stdio 브리지를 제공하지 않습니다. 모델에 제공하는 설정·실행·증거 도구는 [MCP 인터페이스](interfaces.md)를 참고하세요.

경로를 바꾼 뒤 에이전트에게 다음 인자로 `configure`를 호출하도록 요청하세요.

```json
{
  "action": "describe",
  "path": "/absolute/path/to/your-project"
}
```

설정 스키마와 작성 지침을 받으면 연결을 확인한 것입니다. Docker 실행 준비를 확인하거나 테스트를 실행한 것은 아닙니다.

에이전트와 뷰어를 같은 인스턴스에 연결하세요. 한 서버의 결과는 다른 서버의 기록에 나타나지 않습니다. HTTP Plugin은 `54321`, App Page Plugin은 `54322`를 사용하며, `54318`에서 실행 중인 개발 서버를 자동으로 따라가지 않습니다.

## 런타임 업데이트

npm으로 설치한 브라우저 뷰어는 새 버전이 있을 때만
사이드바에 **Update**를 표시합니다. 수동 **업데이트 확인**은 설정 → 업데이트에 있습니다.

npm 런타임은 시작 시와 6시간마다 공개 `@wo658/redpact` 레지스트리의 dist-tag를 조회하고,
브라우저 폴링은 서버 캐시만 읽습니다. 정식 설치는 `latest`, 사전 릴리스 설치는
`beta`와 `latest`를 비교하며 다운그레이드하지 않습니다. 확인 제한 시간은 10초입니다.
패키지 부재, 잘못된 메타데이터와 네트워크 실패는 최신 상태가 아닌 오류입니다.
소스 체크아웃은 npm 자동 확인을 시작하지 않습니다.

확인된 npm/pnpm 전역 설치와 직접 로컬 의존성에서는 `redpact serve`가 교체할 서버 밖에
CLI 부모 프로세스를 유지합니다. **Update**는 확인창을 열고 **설치 후 다시 시작**은 표시한
버전의 설치를 요청합니다. 이미 받은 요청이 끝날 때까지 새 요청을 일시 중단합니다.
진행 중 테스트, 환경 작업과 기타 추적 작업이 있으면 설치를 보류하고 서비스를 재개합니다.
소유한 서버가 종료된 뒤에만 원래 패키지 관리자로 명시된 버전을 설치하며 lifecycle script는
실행하지 않습니다. 로컬 업데이트는 소유 프로젝트의 package manifest와 lockfile을 수정하고
개발 의존성 분류를 유지합니다. 부모는 설치 버전을 검증하고 같은 옵션과 수신 포트로
서버를 다시 시작하며, 브라우저는 해당 버전을 확인한 뒤 새로 고칩니다.

별도 전역 prefix에 설치한 경우 해당 경로가 패키지 관리자의 현재 전역 경로가 아니어도
실행할 수 있습니다. 그 경로에 프로젝트 manifest가 없어도 시작을 차단하지 않습니다.
자동 업데이트는 원래 설치 소유자를 확인할 수 있어야 합니다.

`npx` 캐시, 소유자를 확인하지 못한 설치, 소스 실행과 직접 `main.js` 실행에는 자동 설치
권한을 부여하지 않습니다. 전역 설치를 추측하지 않고 대화상자에 수동 복구 방법을 안내합니다.
`npx`는 이전 프로세스를 종료하고 기존 옵션으로 `npx @wo658/redpact@latest serve`를 실행하세요.
사전 릴리스 사용자는 원하는 버전이나 채널을 명시하고, 다른 설치는 원래 관리자를 사용하세요.

서버를 다시 실행할 수 있으면 설치 실패를 화면에 표시합니다. 패키지 교체나 시작 실패로
접속할 수 없으면 원래 관리자로 다시 실행하거나 설치하세요. 바이너리·데이터의 자동 롤백은
제공하지 않습니다. 부모는 자신의 자식 서버만 관리하므로 같은 패키지를 사용하는 다른
인스턴스는 업데이트 전에 종료하세요. 설정과 증거는 패키지 밖에 유지하며 현재 저장 형식
정책을 따릅니다. npm 버전과 Plugin 패키지 게시는 별도 릴리스 작업이며 이 기능이 패키지를
게시하거나 npm 인증을 설정하지는 않습니다.
