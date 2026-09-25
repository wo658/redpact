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
`name.ko.md`이며 `title`, `description` frontmatter가 필요합니다. `meta.en.json`과
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

검증한 정확한 릴리스 커밋에 태그를 만드세요. 빌드, 로컬 설치, 태그 생성과 게시는
별개 작업입니다. stable `v<version>` 태그는 제품 릴리스 workflow를 시작합니다.
Apple Silicon macOS, Intel macOS와 Windows를 빌드·검증하고 완성된 GitHub Release를
공개한 뒤 같은 버전을 trusted publishing으로 npm에 게시합니다. 모든 desktop matrix
job이 성공할 때까지 GitHub Release는 Draft로 유지합니다. 게시 스크립트는 `-beta.N`에
맞는 npm prerelease dist-tag를 자동 선택하지 않으므로 prerelease는 별도로 검토한
채널이 필요합니다.

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
유지합니다. 설치 소비자는 workspace override를 상속하지 않으므로 번들 그래프를 받습니다. Workspace private 표시는
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
`.claude-plugin/marketplace.json`을 소유합니다. 두 카탈로그는
`plugins/redpact`를 재사용합니다. 사용자 명령과 미지원 경로는
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
