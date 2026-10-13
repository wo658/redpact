---
title: 개발과 문서 관리
description: 기여자 검증, 릴리스와 단일 문서 정본 관리 규칙을 설명합니다.
---

# 개발과 문서 관리

## 하나의 문서 정본

`docs/*.md`와 `docs/meta.*.json`이 제품·구현 문서와 목차의 유일한 정본입니다.
별도 `redpact-web` 저장소가 Next.js/Fumadocs 렌더러, 랜딩과 데모를 소유합니다.
이 디렉터리를 직접 읽어 같은 웹사이트 빌드의 `/en/docs/`, `/ko/docs/`로 제공합니다.
이 저장소에는 문서 앱이 없으며 본문 사본이나 동기화 명령도 없습니다.

가이드는 사용자 작업을, 레퍼런스는 정확한 계약과 구현 규칙을 소유합니다. 같은 계약을
반복하지 말고 소유 페이지를 링크합니다. 저장소 README는 짧은 진입점과 패키지·예제
실행 안내이며 `AGENTS.md`는 에이전트 작업 정책입니다. 라이선스·거버넌스·실행 가능한
skill 지시는 고유 목적을 유지하며 병렬 제품 설명서가 아닙니다.

## 모든 변경의 필수 유지 작업

1. 구현 전에 영향받는 문서를 찾습니다. 동작, 기본값, API·설정, UI 탐색, 제약, 명령을
   바꾸면 같은 변경에서 소유 문서를 수정합니다. 문서가 옛 동작을 설명하면 작업은 미완료입니다.
2. 영어와 한국어의 제목·설명·목차·예제·링크를 함께 수정합니다. 문서 영향 없는 내부
   리팩터링이면 PR이나 완료 보고에 이유를 적고 불필요한 문서 편집을 만들지 않습니다.
3. 현재 구현 동작을 설명합니다. 제약은 기능 옆에, 제안은 issue·PR 논의에, 실행·머지
   증거는 task·PR에 기록합니다. 과거 결정은 Git으로 복구하며 현재 문서에 일지를 누적하지 않습니다.
4. 페이지를 추가하기 전에 기존 주제를 재사용합니다. 새 문서는 웹에 렌더링되고 양쪽
   목차에 포함되며 완전한 번역이 있어야 합니다. 숨은 문서, 생성 사본, 두 번째 설명서를 만들지 않습니다.
5. 문서 검사를 수행하고 실제 검증 범위를 보고합니다. 테스트는 링크·번역 파일 존재를
   확인할 수 있지만 사실과 번역 의미는 리뷰어가 확인해야 합니다.

소문자와 hyphen으로 된 안정된 slug를 사용합니다. 영어는 `name.md`, 한국어는
`name.md`이며 `title`, `description` frontmatter가 필요합니다. `meta.en.json`과
`meta.ko.json`은 같은 page ID를 나열합니다. 문서 사이에는 상대 Markdown 링크를
사용하고 렌더러가 선택 언어를 유지합니다. `../` 링크는 GitHub 소스를 열며 로컬 미push
내용보다 오래될 수 있습니다. 언어 간 heading anchor를 공유하거나 ID가 다르면 페이지를
링크합니다. HTTP·JSON 스키마를 복사하지 말고 생성 API·`configure describe`를 참조하고
이곳에는 의미를 설명합니다.

## 로컬 준비와 검사

Node 24+와 pnpm을 사용합니다. `pnpm install --frozen-lockfile`로 설치하고 script를
생략했다면 `pnpm prepare`로 추적 hook을 활성화합니다. 실행 코드 변경 완료 전 검사:

```sh
pnpm --filter @redpact/server typecheck
pnpm --filter @redpact/server test
pnpm --filter @redpact/web test
pnpm --filter @redpact/web build
pnpm docs:check
pnpm lint
```

서버 test script는 공개 CLI 테스트 전에 빌드합니다. 영향받는 인수 테스트도 실행하며
기본 서버 테스트만으로 실제 Docker 동작을 입증하지 않습니다. 관리 self-E2E는
[저장소 절차](../e2e/README.md)에 따라 실제 체크아웃·공유 설정을 유지하고 반환된 제출을
그 워크트리 뷰어에서 확인합니다. Docker 빌드 컨텍스트에서 생성물인 `.source`와
`.next` 디렉터리를 제외하여 호스트 전용 웹사이트 경로와 캐시가 런타임 이미지에 들어가지 않게 합니다.
구현 전 실제 어설션 실패를 관찰합니다. 수집·환경 오류는
기능 red가 아닙니다. 검토된 어설션을 약화하거나 관찰하지 않은 결과를 주장하지 않습니다.

기본 서버 테스트에서 Docker, 설치 패키지, 실제 앱 검사는 명시적으로 활성화해야 합니다.
이 검사까지 실행하려면 필요한 산출물을 준비하고 네 가지 실행 조건을 모두 켭니다.
빌드는 테스트 전에 실행합니다. 패키징은 CLI·runner 테스트가 읽는 `dist`를 다시 만듭니다.
전체 opt-in 테스트는 순차 실행하여 어설션을 끄지 않고 Docker 네트워크와 메모리 부하를 제한합니다.

실제 Integration 러너·소스 무결성·마스킹·리소스 제한 어댑터 테스트도 Docker opt-in
검증에 포함됩니다. 호스트 Docker 데몬이 필요하며 관리형 Unit 컨테이너에는 데몬을
마운트하지 않습니다.

관리형 Unit 이미지는 서버 테스트 전에 뷰어를 빌드합니다. 런타임 패키징 테스트가
실제 웹 빌드 결과를 필요로 하기 때문입니다.

```sh
pnpm pack:runtime
docker build -f e2e/Dockerfile -t redpact-test-app:current .
REDPACT_DOCKER_TESTS=1 REDPACT_SELF_UNIT_CONTAINER_TEST=1 \
REDPACT_PACKAGE_TEST=1 REDPACT_APPLICATION_IMAGE=redpact-test-app:current \
pnpm --filter @redpact/server exec vitest run --maxWorkers=1
```

Biome은 중괄호, 중첩 삼항과 early return 뒤 중복 else 제거를 요구하며 인지 복잡도
15 초과를 경고합니다. 단순화할 때 평가 순서와 동작을 보존합니다. 점수보다 책임에 따라
함수를 나누고 이유를 설명하는 짧은 주석, 영어 식별자와 구현 copy를 사용합니다.
Lint는 `.worktrees/` 아래 보관된 별도 체크아웃을 제외하며, 각 체크아웃의 루트에서 검사를 실행합니다.
제출 인수 시나리오는 `AGENTS.md`에 따라 사용자 언어를 따릅니다.

## 문서 검증 책임

기여자는 문서를 영어와 한국어로 함께 수정하고 `pnpm docs:check`를 실행합니다.
공개 PR CI도 같은 내용 검사를 수행합니다. 어느 쪽도 비공개 `redpact-web` 저장소
접근을 요구하지 않습니다. 내용 검사는 화면 렌더링이나 번역의 정확성을 입증하지 않습니다.

문서 변경을 병합하기 전에 렌더러에 접근할 수 있는 유지관리자가 제안된 체크아웃의
문서로 `pnpm docs:build`를 실행하고 검증한 리비전, 명령과 결과를 PR에 기록합니다.
렌더러나 내비게이션 변경이면 한·영 및 데스크톱·모바일 환경에서 미리보기와 실제
브라우저 검사도 수행합니다. 렌더링 실패는 수정될 때까지 미해결 상태이며, 렌더러
접근 권한이 없는 것은 기여자의 실패가 아닙니다. 렌더러를 사용할 수 없을 때 빌드
명령은 계속 실패하며 생략한 빌드를 성공으로 보고하지 않습니다.

## 웹사이트 자동 게시

비공개 `redpact-web` 렌더러는 이 저장소의 `main`을 추적합니다. main에서 Documentation
verification workflow가 통과하면 Actions secret `REDPACT_DOCS_DEPLOY_HOOK`으로 웹 빌드를
요청합니다. 유지보수자는 웹 저장소의 main을 대상으로 만든 Vercel Deploy Hook URL을 이
secret에 저장합니다. PR에서는 내용만 검증하고 운영 배포를 요청하지 않습니다. main에서
workflow를 수동 실행해 게시 요청을 재시도할 수도 있습니다.

배포 요청은 `wo658/redpact`의 main push 또는 수동 실행에서만 수행하며, 포크에서는
배포 job을 건너뜁니다. Hook URL은 Actions secret에만 저장하고 코드나 로그에 노출하지
않습니다. 공개 저장소 조회·클론으로 secret 값을 읽을 수는 없지만, secret에 접근하는
workflow를 수정하고 실행할 수 있는 유지보수자에게까지 값을 숨기는 장치는 아닙니다.
Hook은 비공개 웹 저장소 접근 권한을 제공하지 않고 배포만 요청합니다.

웹 빌드는 공개 main을 한 번 가져온 뒤 같은 체크아웃으로 원본 내용 검사, 렌더러 검사와
한영 페이지 빌드를 수행합니다. 웹 저장소에 문서 사본을 만들지 않습니다. 사용한 실제
커밋은 빌드 로그와 배포된 `/docs-source.json`에 기록합니다. 빌드가 원본을 가져오기 전에
후속 변경이 반영됐다면 더 최신 main 커밋이 포함될 수 있습니다.

Hook 요청 성공은 게시 완료가 아닙니다. Vercel 결과와 배포된 원본 커밋을 확인하세요.
가져오기·검증·빌드가 실패하면 새 결과를 게시하지 않습니다. Hook secret이 없으면 게시
job이 명시적으로 실패합니다. 빌드 재현이나 임시 고정이 필요하면 웹 빌드 환경의
`REDPACT_DOCS_COMMIT`에 전체 SHA를 지정하고, main 자동 추적을 재개할 때 제거합니다.

## 문서 미리보기

원본 검사인 `pnpm docs:check`는 `redpact-web` 접근 없이 공개 저장소에서 실행됩니다.
번역·목차 대응, 페이지 메타데이터와 상대 파일 링크를 검사합니다. 화면 빌드에는 별도
웹사이트 체크아웃과 설치된 의존성이 필요합니다. 아래 루트 명령은 현재 체크아웃의
`docs/`를 `REDPACT_DOCS_DIR`로 전달해 웹사이트 명령을 실행하며 내용을 복사하지 않습니다.

```sh
# 웹사이트 기본 위치: ../redpact-web. 워크트리에서는 절대 경로를 지정합니다.
export REDPACT_WEB_ROOT=/path/to/redpact-web
pnpm docs:dev
# http://127.0.0.1:4310/ko/docs/ 또는 /en/docs/
pnpm docs:build
pnpm docs:preview
pnpm docs:test:preview
```

`redpact-web` 안에서는 `REDPACT_DOCS_DIR`에 문서 디렉터리의 절대 경로를 지정하고
(기본 `../redpact/docs`) `pnpm docs:check`, `pnpm docs:build`, `pnpm docs:preview`를
실행합니다. Preview는 Python 3으로 정적 `out/` 디렉터리를 제공합니다.
라우트, anchor, 언어 전환, 검색과 반응형 탐색의 렌더러 테스트·브라우저 검사는
웹사이트가 소유합니다. 검색은 내보낸 한·영 인덱스를 브라우저에서 조회하므로
별도 검색 서버가 필요하지 않습니다. 전체 웹사이트 빌드는 랜딩·데모·문서를 포함합니다.
`docs:build`는 Next.js 페이지를 빌드하며 데모 동작을 검증할 때는 기존 데모 자산도 필요합니다.
로컬 빌드·미리보기는 게시가 아니며 호스팅은 생성된 사이트를 제공하고 없는 경로에
404를 반환해야 합니다. Fumadocs가 문서 shell과 페이지 배치를 소유합니다.
렌더러 수정 전 설치된 Next.js 안내를 읽으세요.

Docker 빌드 컨텍스트는 문서 렌더러의 생성된 `.next`, `.source`, TypeScript 캐시를
제외하여 호스트 전용 경로가 컨테이너 안에서 다시 생성되도록 합니다.

## 릴리스 정책

Redpact는 베타 기간에 `0.x.y` 제품 버전을 사용하고 사용자에게는 `Beta`를 별도로
표시합니다. 베타 기간의 일반 릴리스에 `-beta.N` 접미사를 붙일 필요는 없습니다.
다음은 [Semantic Versioning](https://semver.org/) 안에서 정한 Redpact의 1.0 이전 운영 규칙입니다.

| 변경 | 버전 예시 |
| --- | --- |
| 버그 수정 또는 작은 사용성 개선 | `0.1.0` → `0.1.1` |
| 의미 있는 기능 추가 | `0.1.3` → `0.2.0` |
| 설정·API·저장 형식의 비호환 변경 | `0.2.4` → `0.3.0`, 변경 안내 필수 |
| 특정 출시 예정 버전의 검증 빌드 | `0.3.0-beta.1` → `0.3.0-beta.2` → `0.3.0` |
| 핵심 기능과 호환성 정책 안정화 | `1.0.0` |

릴리스에 해당하는 가장 큰 증가 단위를 선택하고 minor를 올릴 때 patch는 0으로
초기화합니다. `0.x`의 비호환 변경은 minor를 올리고 영향받는 사용자, 초기화와 수동
조치를 안내해야 합니다. 이는 자동 마이그레이션 지원을 뜻하지 않습니다.
게시된 버전과 태그는 변경하지 않습니다.

릴리스를 표시할 때는 다음 명명 규칙을 사용합니다.

- 제품 표시: `Redpact 0.2.0 · Beta`.
- Git 태그: `v0.2.0`. 검증 빌드는 `v0.3.0-beta.1`.
- 릴리스 제목: `Redpact v0.2.0 — 실행 결과 비교`.
- 문제 진단용 식별 정보: 제품 버전과 짧은 커밋 SHA.

검증된 변경이 준비되면 주 1회 릴리스를 기본으로 하고 중요한 버그는 수시 패치합니다.
버전은 검증한 변경을 배포할 때 올리며 매 커밋이나 단순히 한 주가 지났다는 이유로
올리지 않습니다. 이 주기는 운영 정책이며 자동 일정은 아닙니다. 릴리스 노트는 변경,
검증 결과, 알려진 제한과 필요한 사용자 조치를 영어·한국어로 설명합니다.

서버와 데스크톱은 하나의 제품 릴리스 버전을 공유합니다. 각 패키지 manifest,
Tauri 설정, Cargo manifest와 Cargo lock의 데스크톱 패키지 항목을 같은 릴리스 변경에서
일치시키세요. 현재 버전 동기화는 수동이며 비공개 workspace 루트 버전은 제품 릴리스
번호가 아닙니다.

검증한 정확한 릴리스 커밋에 태그를 만드세요. 일반 PR/push CI는 그대로 유지하며,
무거운 배포 검사는 stable `v<version>` 태그 또는 수동 릴리스 실행에서 수행합니다.
제품 workflow는 **네이티브 데스크톱 설치 검사와 전체 npm 설치 matrix가 모두 성공할 때까지**
GitHub Release를 Draft로 유지합니다. 두 공개 job 모두 이 검사를 우회할 수 없습니다.
별도의 수동 npm workflow도 같은 npm 검증을 재사용합니다.

[npm 검증 workflow](../.github/workflows/runtime-verification.yml)는 tarball을 한 번 만들고
소스 커밋·버전·SHA-256을 기록해 Actions artifact로 보관합니다. Linux x64,
macOS ARM64/Intel, Windows x64에서 Node 24·26으로 같은 파일을 설치합니다.
각 설치는 새 npm 캐시·설치 경로와 활성화된 lifecycle script를 사용합니다.
설치 패키지 식별 정보, CLI 시작, health, 번들 뷰어, MCP configure와 소유 프로세스 종료를
검사합니다. Windows에서는 `.cmd` shim 대신 설치된 CLI JavaScript 진입점을 Node로
실행합니다. 모든 Node 24+ 버전, Docker 실행, 레지스트리 다운로드 가용성을 보장하지 않습니다.

모든 릴리스 검사가 통과한 뒤에만 Draft 데스크톱 Release를 공개하고 검증한 npm tarball을
trusted publishing으로 게시합니다. npm job은 아티팩트 식별 정보를 다시 검사하며 재빌드하지
않습니다. 검증 도중 candidate npm 버전을 게시하지 않습니다. 레지스트리 가용성은 게시 후
확인해야 하며 GitHub와 npm 게시는 원자적 트랜잭션이 아닌 별도 작업입니다. 검사 실패 시
공개되지 않으며 태그와 Draft는 남을 수 있습니다. 인프라 오류는 재실행하고, 소스 수정은
릴리스 태그를 이동하는 대신 새 버전·태그를 사용합니다. 게시 스크립트는 `-beta.N`에 맞는
npm prerelease dist-tag를 자동 선택하지 않으므로 prerelease는 별도로 검토한 채널이 필요합니다.
로컬 `publish:runtime`은 로컬 환경만 검사합니다. 전체 matrix 검증에는 Actions workflow를 사용하세요.

제품 스냅샷과 stable 배포 태그는 `v<version>`입니다. Preview와 기존 아티팩트 검증
workflow는 문서화된 곳에서 `desktop-preview-v<version>`,
`desktop-platform-preview-v<version>`, `runtime-v<version>`을 유지합니다.

## 런타임 패키징과 업데이트

| 명령 | 범위 |
| --- | --- |
| `pnpm pack:runtime` | 웹·서버 빌드와 설치 tarball 생성 |
| `pnpm test:package` | 저장소 밖에서 tarball 설치 검증 |
| `pnpm test:package:docker` | opt-in 실제 Docker 패키지 검사 추가 |
| `pnpm local:update` | 기존 macOS 개발 LaunchAgent 설치 업데이트 |
| `pnpm local:update:plugin` | 설치된 개인 Redpact Codex 플러그인 업데이트 |
| `pnpm local:update:all` | 개발 서비스 후 플러그인. 별개의 순차 작업 |
| `pnpm desktop:update` | 로컬 Tauri 앱 재빌드·교체 |
| `pnpm publish:runtime --dry-run` | 빌드·설치 검증과 게시 없는 릴리스 검사 |
| `pnpm publish:runtime` | npm 권한으로 검증한 패키지 게시 |

빌드만으로 설치 런타임이 바뀌지 않습니다. 개발 서비스와 데스크톱 인스턴스는 별개입니다.
플러그인은 54321 포트의 데스크톱 MCP에 연결하며 개발 서비스 업데이트가 그 연결을
바꾸면 안 됩니다. 기본 서버 포트는 54318입니다. 플러그인·스키마 변경 후 새 클라이언트
task·연결을 시작하세요.

패키지는 웹 에셋, MCP 리소스, 고지, 실행기 파일과 lockfile 증거를 포함합니다.
설치 검증에서 번들 Testcontainers patch, AJV 보안 override를 포함한 고정 Umzug
의존성 그래프, 라이선스를 보존하세요. 패키징의 준비 설치는 workspace override를
유지합니다. 설치 소비자는 workspace override를 상속하지 않으므로 번들 그래프를 받습니다.
macOS 전용 선택적 `fsevents` 의존성은 Linux에서 패키징할 때도 upstream 사전 빌드 바이너리와
라이선스를 함께 번들합니다. `binding.gyp` 없이 `node-gyp rebuild`를 잘못 요청하는
레지스트리 메타데이터를 피하며 소비자의 lifecycle script는 활성화된 상태로 유지합니다. Workspace private 표시는
OSS 소스를 비공개로 만드는 설정이 아닙니다. 게시에는 새 버전과 registry 권한이 필요하며
pack·preview는 게시, Git push, release tag 생성을 하지 않습니다.

로컬 업데이트는 고유 릴리스를 준비하고 전환 전 smoke test와 활성 작업 검사를 수행합니다.
이전 코드를 보존하고 실패 시 rollback을 검증합니다. Rollback은 코드 복원이며 런타임
데이터 호환성 복원이 아닙니다. 살아 있거나 불명확한 writer lock을 제거하거나 관계없는
Docker 리소스를 prune하지 않습니다. 이전 릴리스는 명시적으로 관리할 때까지 남습니다.
선택적 `redpact.autoUpdate` Git 설정은 깨끗한 커밋 뒤 서비스·플러그인 업데이트를 호출할
수 있지만 테스트 검증을 대체하거나 데스크톱 앱을 업데이트하지 않습니다.

구현: [런타임 패키징](../app/server/tools/pack-runtime.mjs),
[로컬 updater](../app/server/tools/local-update.ts),
[데스크톱 updater](../app/desktop/tools/local-update.ts),
[릴리스 workflow](../.github/workflows/npm-publish.yml).

## 공개 설치 배포

공개 저장소는 `install.sh`, `Formula/redpact.rb`, Codex 카탈로그
`.agents/plugins/marketplace.json`, Claude Code 카탈로그
`.claude-plugin/marketplace.json`을 소유합니다. Cursor 카탈로그
`.cursor-plugin/marketplace.json`도 같은 `plugins/redpact`를 재사용하며 Copilot은
Claude 형식의 카탈로그를 읽을 수 있습니다. 플러그인 변경 배포 시 세 매니페스트의
버전을 함께 올립니다. 플러그인 버전은 서버·데스크톱 버전과 독립적이며 GitHub Release
게시만으로 마켓플레이스 브랜치의 내용이 갱신되지는 않습니다. 사용자 명령과 미지원 경로는
[설치 안내](installation.md)를 참고하세요.

런타임 릴리스 전에는 `pnpm test:package`와 필수 실행 코드 검사를 수행합니다.
검증한 바로 그 `dist/redpact-<version>.tgz`와 `SHA256SUMS`를 해당
`runtime-v<version>` GitHub 릴리스에 올립니다. 설치기 버전, Formula URL·체크섬,
설치 예제, 검증 workflow를 함께 갱신합니다. 기존 버전의 파일을 교체하지 않습니다.
데스크톱 업데이터가 `releases/latest`를 사용하므로 런타임 릴리스는 latest로
지정하지 않습니다.
게시 후 `Public installation verification` workflow로 실제 공개 URL에서
Linux x64, macOS arm64, macOS x64 설치를 수행하고 CLI·번들 뷰어·MCP를 확인합니다.
Homebrew와 두 플러그인 클라이언트는 별도로 검증합니다. 이 검사는 Docker 실행이나
각 클라이언트의 MCP Apps 카드 지원을 증명하지 않습니다.


## 비교 파일럿 fixture

`tools/pilot/fixture`는 일반 worktree, Redpact HTTP API의 shell 호출, 직접 MCP를
비교하기 위한 독립적인 메모리 기반 Order Desk fixture입니다. DB 영속성이나
마이그레이션은 검증하지 않습니다. `tools/pilot/tasks.json`에 한국어 인수 과제 세 개와
독립적인 수정 경계를 정의합니다. 기준 앱에는 요청 수량 파싱, UI 필터, 결제 재시도가
의도적으로 없습니다. 기준 테스트 통과가 과제 완료를 뜻하지 않습니다. 실험 제안과
결과는 제품 문서가 아닌 추적 이슈에 기록합니다.

```sh
node --test tools/pilot/*.test.ts tools/pilot/fixture/test/*.test.ts
REDPACT_URL=http://127.0.0.1:54322 node tools/pilot/preflight.ts
node tools/pilot/metrics.ts /path/to/events.jsonl /path/to/metadata.json
docker compose -p tea17-fixture -f tools/pilot/fixture/compose.yaml up -d --build --wait
docker compose -p tea17-fixture -f tools/pilot/fixture/compose.yaml port app 3000
```

실제로 연결된 런타임 주소를 사용합니다. 사전점검은 테스트 실행이나 승인 정책 변경 없이
모델에 노출되는 MCP 도구와 HTTP 경로를 조회합니다. 종료 코드 2는 필수 기능 누락,
1은 조회 실패입니다. 0은 기능 존재만 확인하며 실행 준비, 경로 동등성, 승인을 증명하지
않습니다. 선택적인 출력 경로에는 새 JSON 보고서를 기록하고 기존 파일을 덮어쓰지 않습니다.
MCP 측정 조건에서 누락된 도구를 HTTP 실행으로 대체하지 않습니다.

계측기는 Codex JSONL과 `elapsedMs`, `exitCode`, 선택적 `infrastructureError`를 담은
메타데이터를 읽습니다. 사용량 누락은 0이 아닌 미확인으로 처리하며 캐시 입력은 전체
입력에 포함됩니다. 최대 컨텍스트 점유와 압축 횟수는 별도 계측 없이는 미확인입니다.
원본 trace에는 프롬프트, 코드, 도구 출력이 포함될 수 있으므로 Git 밖에 비공개로
보존합니다. 개발과 평가 비용을 분리하고 측정한 부모의 조율 비용도 포함합니다.

Compose 명령은 로컬 fixture 검증이며 Redpact 관리 실행 증거가 아닙니다. 앱은 수량
1·2·3의 초기 주문과 프로세스별 새 재고를 제공합니다. `PAYMENT_FAILURES`와
`PAYMENT_PERMANENT`는 결정적인 결제 mock을 설정합니다. 임시 공개 포트를 사용하므로
고정 호스트 포트가 필요하지 않습니다. 확인에 필요한 환경은 유지하고, 확인이 끝나면
같은 Compose 프로젝트 이름과 `down --volumes`로 소유한 fixture만 제거합니다.

단일 과제 수집기는 `node tools/pilot/measure.ts CONFIG.json`으로 실행합니다. JSON에는
절대경로 `cwd`, `promptFile`, 새 `outputDirectory`, `condition`(`A`, `B`, `C`),
명시적 `model`, `reasoningEffort`, `timeoutMs`가 필요합니다. C에는 연결된 `/mcp`
엔드포인트를 가리키는 `redpactUrl`도 필요합니다. 수집기는 승인 우회 없이 Codex의
workspace-write 격리를 기본으로 사용하고(`approvalMode: "sandbox_only"`) 플러그인과
중첩 에이전트를 끄며 인증을 유지합니다. 사용자가 자동 승인 검토를 명시적으로 허용하면
`approvalMode: "auto_review"`는 `--sandbox workspace-write` 대신 `--approve-for-me`를
사용합니다. 두 CLI 플래그는 상호 배타적이며 어느 모드도 승인을 우회하지 않습니다.
조건 비교 전 사용자·프로젝트 지시와 도구 격리는 별도로 확인해야 합니다. 단조 시계의
경과시간, JSONL, stderr, 프로세스 메타데이터, 사용량 요약을 기록합니다. 시간초과는
자손 프로세스나 컨테이너 정리를 증명하지 않습니다. 아래 배치 조율기가 이 수집기와
독립 산출물 평가를 연결합니다. 병합한 배치의 통합 검증은 범위에 포함하지 않습니다.

배치 실행기는 자식 에이전트 자체를 피실험자로 실행합니다. 각 피실험자는 실험 준비를
돕는 보조 에이전트가 아니라 자기 컨텍스트와 Git worktree를 갖는 새로운 일회성
`codex exec` 프로세스입니다. 동일한 기준 fixture 커밋에서 동일한 세 과제 중 하나를
받습니다. 조건 내에서는 세 과제를 병렬로 실행합니다. 조건 간에는 반복마다 seed로
섞은 순서에 따라 순차 실행하여 같은 호스트에서 조건들이 자원을 두고 경쟁하지 않습니다.

다음 필드로 JSON 설정을 준비합니다. 경로는 실제 호스트 경로여야 하며 모델은 해당
Codex CLI에서 사용할 수 있어야 합니다.

```json
{
  "root": "/absolute/project/experiments/tea17-run-01",
  "model": "gpt-6.1-sol",
  "reasoningEffort": "medium",
  "approvalMode": "auto_review",
  "conditions": ["A", "B", "C"],
  "repetitions": 2,
  "seed": 17,
  "timeoutMs": 900000,
  "evaluationTimeoutMs": 120000,
  "redpactOrigin": "http://127.0.0.1:54322",
  "playwrightModule": "/absolute/node_modules/playwright/index.mjs",
  "httpGuideFile": "/absolute/redpact-checkout/tools/pilot/http-guide.txt",
  "environmentGuideFile": "/absolute/private/environment-guide.txt"
}
```

```sh
node tools/pilot/batch.ts prepare /absolute/private/config.json
node tools/pilot/batch.ts run /absolute/project/experiments/tea17-run-01/manifest.json
```

예시는 사용자가 허용한 자동 승인 검토를 선택합니다. `approvalMode`를 생략하거나
`sandbox_only`로 설정하면 기본값인 명시적 workspace-write 샌드박스를 사용합니다.
`auto_review`는 사용자 허용이 있을 때만 사용합니다. 거절된 요청은 차단 상태로
trace에 보고하고 우회 경로로 재시도하지 않습니다. 비교하는 모든 A/B/C 피실험자에
동일한 승인 모드를 적용합니다. 자식 프로세스 종료, 실행 기록, 저장한 artifact만으로
자원 정리를 증명하지 않으며 남은 컨테이너와 자손 프로세스를 독립적으로 확인합니다.

`root`는 아직 없는 경로이며 영구적인 프로젝트 소유 위치에 보존해야 합니다. `prepare`는
기준 저장소, 피실험자 worktree, 비공개 프롬프트, 고정된 평가 테스트 사본과
`manifest.json`을 만들며 개발 에이전트를 실행하지 않습니다. `repetitions`는 1–20,
`conditions`는 중복 없는 A/B/C 값입니다. `timeoutMs`는 피실험자별,
`evaluationTimeoutMs`는 평가별 제한시간입니다. B에는 `httpGuideFile`이 필수입니다.
검토한 서버 경로·요청 본문·승인 제약을 담은 `tools/pilot/http-guide.txt`를 사용합니다.
호출 전 연결된 런타임의 OpenAPI 계약을 확인하며, 의도적으로 선택한 런타임의 계약이
다를 때만 가이드를 교체합니다.
API 경로를 추측하거나 인간 승인용 엔드포인트를 에이전트 작업으로 제공하지 않습니다.
B/C에는 실제 연결된 루프백 HTTP 런타임을 가리키는 `redpactOrigin`이 필요합니다.

`run`은 실행 전에 깨끗한 기준 checkout과 고정 평가자를 확인합니다. B/C에서는 런타임
기능을 조회하고 `configure describe`로 실험 primary 설정 루트를 확인한 뒤 공유 설정
템플릿을 작성하고 피실험자 checkout을 검증합니다. 기능이 없으면 실행을 차단합니다.
런타임을 업데이트하거나 MCP를 HTTP로 대체하지 않습니다. A만 실행하면 Redpact 설정이
필요하지 않습니다. 검증 통과가 실행 승인이나 Docker 준비 상태를 뜻하지는 않습니다.

A 피실험자는 직접 Compose로 검증하고 B는 shell HTTP 요청, C는 Redpact MCP를
사용합니다. 개발 중 로컬 단위 테스트는 모두 허용합니다. 공개 프롬프트에는 평가자가
사용하는 UI 선택자와 컨트롤 이름을 명시합니다. 평가 파일은 피실험자 checkout 밖에 두고
다른 worktree, 이전 trace, 과거 브랜치, 참조 구현을 읽지 않도록 지시합니다. 이는 지시에
의한 분리이며 호스트 읽기를 막는 보안 경계가 아닙니다. 인과 비교 전에 원본 trace와
변경 파일 범위를 검토해야 합니다. 범위 검사는 NUL로 구분된 Git 경로를 읽으므로
증거 파일 이름의 비ASCII 문자, 공백, 줄바꿈을 범위 위반으로 잘못 분류하지 않습니다.

`environmentGuideFile`은 선택 사항입니다. 지정하면 해당 내용을 모든 A/B/C 피실험자
프롬프트에 동일하게 덧붙입니다. 기준 상태를 준비하기 전에 불변 Docker 이미지 ID,
러너·브라우저 식별 정보, 캐시 정책과 공통 실행 지시를 기록합니다. 현재 브라우저 프로토콜은
Linux arm64의 Playwright 1.63.0과 Chromium 153.0.8010.12를 고정합니다. 조건마다
동일하게 미리 준비한 런타임 이미지를 재사용하되 실행할 때마다 러너 컨테이너와 브라우저
프로필은 새로 만듭니다. 따라서 이미지 캐시가 준비된 개발을 측정하며 최초 의존성·브라우저
설치 비용은 제외합니다. 모델 프롬프트 캐시는 통제하지 않습니다. 관찰된 캐시 입력 토큰을
보존하고 이 제약을 공개하며 캐시가 없는 실험이라고 표현하지 않습니다.

A의 직접 검증용으로 fixture에 `integration.ts`와 `browser.ts`를 제공합니다. 소유한
Compose 네트워크와 불변 `sha256:` Docker 이미지 ID를 받아 현재 테스트 소스를 새
컨테이너에 복사하고 결과와 러너·브라우저 식별 정보를 `artifacts/`에 보존합니다.
Redpact를 호출하지 않습니다. B/C는 같은 고정 러너 이미지를 사용하는 관리형 런타임을
호출합니다. 공통 환경 가이드에 해당 이미지 ID를 제공하고 변경 가능한 이미지 태그로
대체하지 않습니다. 직접 브라우저 도우미에는 viewport를 명시적으로 전달합니다.
파일럿에서는 도우미 기본값에 의존하지 않고 1440×900과 390×844를 사용합니다.

```sh
node integration.ts OWNED_COMPOSE_NETWORK IMMUTABLE_INTEGRATION_IMAGE_ID
node browser.ts OWNED_COMPOSE_NETWORK IMMUTABLE_BROWSER_IMAGE_ID http://app.redpact.test:3000 functional 1440 900
node browser.ts OWNED_COMPOSE_NETWORK IMMUTABLE_BROWSER_IMAGE_ID http://app.redpact.test:3000 functional 390 844
```

Worktree Playwright 소스는 `ui-tests/worktree/`에 둡니다. `baseline.spec.ts`는 공개
smoke, `task.spec.ts`는 피실험자가 작성하는 기능 테스트, `capture.spec.ts`는 캡처
시나리오입니다. 공유 설정은 functional target에서 baseline과 task 파일을, capture
target에서 capture 파일을 선택합니다. 두 target의 `scope`는 `worktree`입니다.
설정된 desktop viewport는 1440×900, mobile viewport는 390×844입니다. 독립 평가자의
호스트·브라우저 모듈·브라우저 버전은 모든 산출물에서 동일하게 유지하고 별도로 기록합니다.
평가자 호스트 브라우저는 평가 환경이며 피실험자의 고정 Linux 브라우저와 구분합니다.
런타임 업데이트는 별도 허용과 준비가 필요합니다. 배치 실행기는 연결된 런타임을
확인할 뿐 측정 도중 업그레이드하지 않습니다.

각 배치가 끝나면 산출물을 복사해 고정하고 배정된 과제를 독립 평가합니다. `report.json`은
피실험자별 증거, 실제 입력·캐시 입력·출력 토큰 사용량(누락은 `null`), 과제 성공률과
테스트 통과율, 피실험자·배치 경과시간을 담습니다. 인프라 오류를 기능 실패나 테스트
0건 성공으로 바꾸지 않습니다. 평가가 불완전하면 전체 정확도는 미확인으로 두고 관찰한
결과를 별도 보고합니다. 실패 실행도 개발 비용에 포함하며 평가 시간은 따로 기록합니다.
결정적인 프로세스 조율기에는 모델 토큰 비용이 없습니다. 준비 보조 에이전트와 사람 개입은
그 합계 밖이므로 별도 공개해야 합니다. 전송 조건 준수는 trace 수동 검토, 자원 정리는
독립 확인이 필요합니다. 독립 인수 테스트 통과만으로 병합 코드의 정확성이나 관리형 검증
완료를 증명하지 않습니다. 증거와 worktree는 보존하며 완료한 manifest를 새 반복으로
재사용하지 않습니다.

평가자 전용 테스트는 `tools/pilot/evaluation`에 있습니다. `PILOT_CHECKOUT`을 평가할
fixture의 절대경로로 설정하고 `node --test tools/pilot/evaluation/*.acceptance.ts`를
실행합니다. UI 평가자는 설치된 Playwright 또는 명시적인 `PILOT_PLAYWRIGHT_MODULE`
모듈 경로를 사용합니다. 실제 앱의 영어 Apply/Reset/Retry 컨트롤을 검증합니다.
수정하지 않은 기준 앱은 과제 인수 테스트에 실패하는 것이 정상입니다. 평가 테스트,
참조 정답과 이전 trace는 모든 개발 에이전트의 checkout 밖에 두고 실험 저장소에는
fixture만 복사합니다. 의도적인 미구현 상태를 단언하는 기준 테스트는 준비용 점검이며
과제 산출물이 지켜야 할 회귀 요구가 아닙니다. 파일럿을 고정하기 전에 별도의 비공개
참조 구현으로 평가자의 red/green을 검증합니다. 관리 실행 러너 템플릿은 이 독립 평가
경로와 구분합니다.

`fixture/settings.example.json`은 템플릿이며 활성 공유 설정이 아닙니다. 생성한 실험
저장소에서 `configure describe`로 기본 설정 루트를 확인한 뒤 그 위치의
`.redpact/settings.json`을 작성하고 같은 checkout을 검증합니다. fixture에는 이식 가능한
Vitest Integration step과 분리된 Playwright functional/capture target이 있습니다.
설정된 Redpact 러너가 필요하며 템플릿 복사나 로컬 기준 테스트 통과가 관리 실행을
증명하지 않습니다. 샘플에 별도의 제품 CLI는 필요하지 않습니다. B 조건은 HTTP를 사용하고,
포함된 CLI는 실험 준비·점검·계측만 담당합니다.

Playwright functional 대상은 `baseline.spec.ts`와 피실험자가 작성한
`ui-tests/task.spec.ts`를 포함하며 프롬프트에 파일명을 명시합니다. 모든 조건의
HTTP 검증 테스트는 `integration/`에 작성하고 `APP_URL`을 사용합니다.
