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
skill 지시는 고유 목적을 유지하며 병렬 제품 설명서가 아닙니다. 루트 README는
제품 가이드의 번역본을 중복 유지하는 대신 두 언어의 정본 문서로 연결하는 영어
진입점입니다.

`app/server/src/interfaces/http/docs/`는 웹사이트 본문이 아니라 OpenAPI 스키마와
레퍼런스 경로를 구현하는 실행 코드입니다. [HTTP 레퍼런스](interfaces.md)를 참고하세요.
`app/server/PACKAGE_README.md`는 패키징할 때 설치 패키지의 README가 됩니다.
server/web README는 소유 주제로 연결하고, `e2e/README.md`와 `ui-tests/README.md`는
이 저장소의 테스트 실행 절차와 검증 범위를 설명합니다.
자산 고지와 Plugin skill 참조 자료는 배포되는 산출물과 함께 유지합니다.

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
링크합니다. HTTP·JSON 스키마를 복사하지 말고 생성 API·`redpact settings describe --scope project`를 참조하고
이곳에는 의미를 설명합니다.

## 로컬 준비와 검사

저장소는 보존된 워크트리와 로컬 실험 근거를 포함해 `.codex/` 전체를 Git에서
제외합니다. 재사용할 프로젝트 지침과 배포 메타데이터는 기존 추적 위치에 유지하세요.
이 디렉터리를 강제로 추가해 로컬 에이전트 기록, 실험 설정이나 스크린샷을 공개하지 마세요.

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

## 로컬 테스트 계획 채팅 검증

선택적인 [MCP Apps 검증 앱](../app/web/src/entries/test-plan-probe.tsx)은 자연어 테스트
편집과 채팅 제출을 확인하는 별도의 로컬 전용 플러그인입니다. 제품의 테스트 흐름,
설정, 실행 승인을 변경하지 않습니다. 화면은 기존 Redpact의 탭, 버튼, 텍스트 입력, 공통 CSS와 폰트를 재사용합니다. 최상단의 Unit·Integration·Playwright 탭으로 편집할 목록을 선택하며 전환해도 수정 내용이 유지됩니다. 호스트의 밝은 테마와 어두운 테마를 따릅니다. 루트 워크스페이스와 사이드바 예제 의존성을 설치한 뒤
`examples/sidebar-app`에서 실행합니다.

```sh
node probe/build.mjs
node probe/browser.mjs
codex plugin marketplace add "$PWD/dist/test-plan-probe-marketplace"
codex plugin add test-plan-probe@redpact-test-plan-probe
```

필요하면 호스트를 다시 연결하고 대화에서 **Redpact Test Plan Probe**를 선택한 뒤
검증 앱을 열어 달라고 요청합니다. Unit, Integration, Playwright 항목을 수정하고
**Submit** 또는 **Modify**를 선택합니다. 기본 하단에는 Submit과 Modify만 표시됩니다. Modify를 눌렀을 때만 작은 대화상자가 열리고 **Send**가 현재 세 종류의 계획과 의견을 함께 보내 재검토용 초안을 요청합니다. 재작성 요청은 승인이 아니며 의견이 비어 있으면 제출할 수 없습니다. 전송이 수락되면 입력창은 닫히며, 거절되면 의견을 보존한 채 열린 상태로 유지됩니다. Cancel 또는 Escape로 닫아도 의견 초안은 유지됩니다. 긴 항목은 자동으로 높이가 늘어나고, 목록 영역만 스크롤하므로 상단 탭과 하단 액션은 유지됩니다. 수정 내용은 열린 화면 안에만 유지됩니다.
앱은 `App.sendMessage`로 현재 본문과 고유 식별 코드를 보내며 예제 테스트를
실행하지 않습니다. 호스트가 메시지 지원을 선언해야 합니다. 호스트가 제출을
거절해도 편집한 계획은 유지됩니다.

브라우저 검사는 실제 SDK 브리지와 메시지를 기록하는 호스트를 사용합니다.
편집·추가·삭제·제출 원문·거절 후 복구를 확인하고 데스크톱 및 모바일 화면을
`dist/test-plan-probe-evidence/`에 캡처합니다. 이 결과는 GPT 수신을 증명하지 않습니다.
실제 호스트 검증에는 제출한 식별 코드와 수정 본문이 포함된 후속 모델 응답이
필요합니다. SDK 응답 성공만으로는 충분하지 않습니다. 호스트 재연결, 입력창에서의
전송 또는 사용자의 다른 명시적 동작이 필요할 수 있습니다. 이 검증 앱은 배포되는
Redpact 플러그인이나 관리형 실행 근거에 포함되지 않습니다.

## CI 범위

자동 애플리케이션 CI는 관련 PR과 main push에서 Ubuntu/Node 24의 단일 job으로 lint,
문서 내용 검사, 서버 타입 검사, 웹 빌드(TypeScript 검사 포함), 서버 빌드·테스트와 웹
테스트를 실행합니다. 지원하는 웹·서버 패키지를 명시적으로 대상으로 하며 별도 Docker
job이나 OS/Node 매트릭스는 실행하지 않습니다. Docker와 영향받는 실제 앱 검사는 필요한
변경에 대한 로컬 검증으로 계속 사용할 수 있으며, CI 통과가 이 검사들의 실행을 뜻하지는 않습니다.

[App Page Plugin workflow](../.github/workflows/plugin-verification.yml)는 수동 실행 전용입니다.
플러그인 게시 전 패키징과 npm/pnpm 브라우저 검사를 실행할 수 있지만, 모든 웹 PR에서
자동으로 실행하지 않습니다. 문서 CI와 main의 웹사이트 배포 요청은 앱 CI와 독립적입니다.
런타임 npm 게시도 수동으로 실행하며 아래의 단일 환경 아티팩트 검증을 사용합니다.

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

Hook 요청 성공은 게시 완료가 아닙니다. 같은 배포 job에서 의존성 설치 없이
`node tools/docs/publication.mjs`를 실행합니다. 캐시 우회 요청으로 운영
`/docs-source.json`을 최대 30회, 관측 사이 10초 간격으로 확인합니다. 전체 확인 시간은
약 8분, HTTP 요청 제한은 10초이며 job 전체 제한은 12분입니다. 마커의 저장소와 브랜치는
이 저장소의 main이어야 하며, SHA는 요청한 커밋 또는 현재 공개 main에서 도달 가능한
그 후속 커밋이어야 합니다. Git 조상 관계를 검사하여 최신 main 빌드에 여러 연속 변경이
포함되어도 이전 요청이 잘못 실패하지 않게 합니다. 무관하거나 오래된 커밋은 인정하지 않습니다.

`/en/docs/`와 `/ko/docs/`도 모두 성공한 HTML 응답을 반환해야 합니다. 성공하면 요청 SHA,
배포 SHA와 운영 마커 URL을 CI job 요약에 기록합니다. 게시 결과를 확인할 때는 배포 job
요약의 SHA와 실제 `/docs-source.json`을 비교하세요. 이후 배포로 실제 마커가 더 최신
커밋으로 바뀔 수 있습니다. 이는 운영 소스 식별 정보와 경로
가용성을 확인하며, 화면 배치나 번역 품질 검증은 아닙니다. 배포 job은 확인 단계까지
직렬화되며 각 hook은 오래된 소스를 고정하지 않고 현재 main을 요청합니다. 이후 외부
배포나 수동 롤백까지 막지는 않습니다.

오래된 마커, 요청 실패나 언어 경로 오류는 제한 내에서 재시도하고, 한도를 넘으면 마지막
문제와 함께 CI가 실패합니다. Hook secret 누락이나 hook 요청 실패도 명시적으로 실패합니다.
Vercel 문제를 해결한 뒤 실패 job을 재실행하거나 main에서 workflow를 수동 실행하세요.
빌드 재현이나 임시 고정이 필요하면 웹 빌드 환경의 `REDPACT_DOCS_COMMIT`에 전체 SHA를
지정하고, main 자동 추적을 재개할 때 제거합니다. 요청 커밋보다 오래된 커밋을 고정하면
게시 검증이 실패합니다.

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

지원 배포는 npm/pnpm 웹 런타임, Plugin과 독립 에이전트 스킬입니다. 제품 버전은
`app/server/package.json`에서 관리합니다. 검증한 커밋에 `v<version>` 태그를 만들고
수동 [npm workflow](../.github/workflows/npm-publish.yml)를 실행하세요.
태그 push 자체는 npm 게시를 시작하지 않습니다.

[npm 검증 workflow](../.github/workflows/runtime-verification.yml)는 Ubuntu/Node 24의
단일 job으로 실행합니다. tarball 하나를 빌드하고 설치 검증한 뒤 서버·웹 테스트를 실행하고,
소스 커밋·버전·SHA-256을 기록해 Actions artifact로 보관합니다. OS/Node 설치 매트릭스는
없습니다. 이 CI는 다른 호스트 환경, Docker 실행이나 레지스트리 다운로드 가용성을
입증하지 않습니다.

모든 런타임 릴리스 검사가 통과한 뒤에만 검증한 npm tarball을
trusted publishing으로 게시합니다. npm job은 아티팩트 식별 정보를 다시 검사하며 재빌드하지
않습니다. 검증 도중 candidate npm 버전을 게시하지 않습니다. 레지스트리 가용성은 게시 후
확인해야 하며 GitHub와 npm 게시는 원자적 트랜잭션이 아닌 별도 작업입니다. 검사 실패 시
공개되지 않으며 태그와 Draft는 남을 수 있습니다. 인프라 오류는 재실행하고, 소스 수정은
릴리스 태그를 이동하는 대신 새 버전·태그를 사용합니다. 게시 스크립트는 `-beta.N`에 맞는
npm prerelease dist-tag를 자동 선택하지 않으므로 prerelease는 별도로 검토한 채널이 필요합니다.
로컬 `publish:runtime`은 로컬 환경만 검사합니다. Actions는 Ubuntu/Node 24를 검증 기준으로 사용합니다.

제품 스냅샷 태그는 `v<version>`입니다.

## 런타임 패키징과 업데이트

| 명령 | 범위 |
| --- | --- |
| `pnpm pack:runtime` | 웹·서버 빌드와 설치 tarball 생성 |
| `pnpm test:package` | 저장소 밖에서 tarball 설치 검증 |
| `pnpm test:package:docker` | opt-in 실제 Docker 패키지 검사 추가 |
| `pnpm local:update` | 기존 macOS 개발 LaunchAgent 설치 업데이트 |
| `pnpm local:update:plugin` | 설치된 개인 Redpact Codex 플러그인 업데이트 |
| `pnpm local:update:all` | 개발 서비스 후 플러그인. 별개의 순차 작업 |
| `pnpm publish:runtime --dry-run` | 빌드·설치 검증과 게시 없는 릴리스 검사 |
| `pnpm publish:runtime` | npm 권한으로 검증한 패키지 게시 |

빌드만으로 설치 런타임이 바뀌지 않습니다. CLI 기본 포트는 54318, HTTP 에이전트
Plugin 예시는 54321, App Page Plugin은 54322를 사용합니다. 각 인스턴스의 데이터와
업데이트 소유권은 독립적입니다. Plugin·스키마 변경 후 호스트를 다시 연결하세요.

패키지는 웹 에셋, 고지, 실행기 파일과 lockfile 증거를 포함합니다.
공통 런타임 writer guard에 사용하는 고정 버전 `fs-native-extensions`와 네이티브
prebuild를 번들로 포함하며, 릴리스 전에 단일 환경의 설치 패키지 검사로 검증해야 합니다.
설치 검증에서 번들 Testcontainers patch, AJV 보안 override를 포함한 고정 Umzug
의존성 그래프, 라이선스를 보존하세요. 패키징의 준비 설치는 workspace override를
유지합니다. 설치 소비자는 workspace override를 상속하지 않으므로 번들 그래프를 받습니다.
macOS 전용 선택적 `fsevents` 의존성은 Linux에서 패키징할 때도 upstream 사전 빌드 바이너리와
라이선스를 함께 번들합니다. `binding.gyp` 없이 `node-gyp rebuild`를 잘못 요청하는
레지스트리 메타데이터를 피하며 소비자의 lifecycle script는 활성화된 상태로 유지합니다. Workspace private 표시는
OSS 소스를 비공개로 만드는 설정이 아닙니다. 게시에는 새 버전과 registry 권한이 필요하며
pack·preview는 게시, Git push, release tag 생성을 하지 않습니다.

로컬 업데이트는 고유 릴리스를 준비하고 전환 전 smoke test와 활성 작업 검사를 수행합니다.
이전 코드를 보존하고 실패 시 rollback을 검증합니다. 후보 검증은 HTTP 상태와 패키지 UI 검사에
더해 읽기 전용 MCP `redpact_status` 도구를 요구합니다. 복원한 이전 설치를 검증할 때만
`redpact_status`가 없으면 기존 `configure describe` 확인을 허용합니다. Rollback은 코드 복원이며 런타임
데이터 호환성 복원이 아닙니다. 살아 있거나 불명확한 writer lock을 제거하거나 관계없는
Docker 리소스를 prune하지 않습니다. 이전 릴리스는 명시적으로 관리할 때까지 남습니다.
선택적 `redpact.autoUpdate` Git 설정은 깨끗한 커밋 뒤 서비스·플러그인 업데이트를 호출할
수 있지만 테스트 검증을 대체하지 않습니다.

구현: [런타임 패키징](../app/server/tools/pack-runtime.mjs),
[로컬 updater](../app/server/tools/local-update.ts),
[릴리스 workflow](../.github/workflows/npm-publish.yml).

## 공개 설치 배포

공개 배포 경로는 npm/pnpm 웹 런타임, Plugin과 Skills CLI 독립 에이전트 스킬입니다.
독립 스킬은 `plugins/redpact/skills/` 원본을 재사용하며 별도로 설치한 런타임이 필요합니다.
명령은 [설치 문서](installation.md)를 참고하세요. 소스 빌드와 Docker Compose는
기여자 개발 도구이며 추가 제품 배포 채널이 아닙니다.

Codex 카탈로그 `.agents/plugins/marketplace.json`은 npm의 `@wo658/redpact-plugin`을
고정 버전으로 설치합니다. Claude·Cursor 카탈로그는 기존 HTTP Plugin을 사용합니다.
App Page Plugin 버전은 런타임 및 HTTP Plugin 버전과 독립적입니다.
`.agents/plugins/marketplace.json`의 npm 소스가 생성되는 npm·Plugin manifest의
패키지명과 버전을 결정하는 단일 기준입니다. Plugin 릴리스를 준비할 때 카탈로그의
고정 버전을 바꾸며 빌드에 별도 버전을 하드코딩하지 않습니다.
`pnpm plugins:check --registry`는 고정 버전이 npm에 게시되어 있고 `latest` dist-tag와
일치하는지 검증합니다. 애플리케이션 CI는 카탈로그만 변경한 경우에도 Ubuntu/Node 24에서
이 검사를 실행하며 레지스트리 장애도 검사 실패로 처리합니다. 추출 패키지 검증도 게시 전에
두 manifest를 카탈로그와 비교합니다.

`examples/sidebar-app`에서 `pnpm pack:plugin`은 macOS arm64용 Node·npm·pnpm,
전체 웹 뷰어, MCP companion과 스킬을 묶습니다. `pnpm test`, `pnpm typecheck`,
`pnpm test:package`를 실행하고 npm·pnpm 실제 설치 브라우저 검사도 각각 실행하세요.
`dist/plugin-artifact.json`은 소스 커밋·버전·tarball SHA-256을 기록합니다.
검증한 tarball을 `npm publish <tarball> --access public`으로 게시한 뒤 레지스트리에서
`pnpm plugins:check --registry`로 검증한 뒤 카탈로그 변경을 병합합니다.
준비 중인 미게시 버전은 게시가 끝날 때까지 레지스트리 검사가 실패하는 것이 정상입니다.
게시된 버전은 교체하지 않습니다.
수동 [Plugin workflow](../.github/workflows/plugin-verification.yml)는 기본적으로 검증만 합니다.
검증한 tarball을 `npm pack --dry-run`으로 검사하므로 이미 게시한 버전도 재검증할 수 있습니다.
`publish` 입력을 켜면 검증한 아티팩트를 Ubuntu/Node 24 job에서 npm OIDC trusted publishing으로
게시합니다. 게시기는 카탈로그 버전·소스 커밋·파일명·SHA-256을 확인하고 재빌드 없이 게시한 뒤
npm 처리와 레지스트리·카탈로그 일치를 최대 5분 기다립니다. 마지막 검사에서도 불일치하거나
레지스트리 장애가 있으면 job이 실패합니다. 패키지 신뢰 연결은
`npm trust github @wo658/redpact-plugin --repo wo658/redpact --file plugin-verification.yml --allow-publish --yes`로
npm 11.15 이상에서 한 번 설정합니다. 계정 설정에는 npm 2차 인증이 필요할 수 있지만 이후 workflow 게시는
단기 OIDC 인증을 사용하므로 npm 쓰기 토큰을 저장할 필요가 없습니다. 게시 버전은 변경할 수
없으므로 새 버전에서만 게시를 실행하세요.

Plugin 설치는 lifecycle script를 실행하지 않으며 런타임 설치·시작은 앱 안에서 명시적으로
요청합니다. 호스트의 실제 사이드바 노출 검증은 브라우저 harness 검사와 별개입니다.

사용자 명령, 호스트와 플랫폼 제약은 [설치 안내](installation.md)를 참고하세요.

## 비교 파일럿 fixture

이 A/B/C 프로토콜은 실행 가능한 MCP 런타임을 전제로 한 과거 실험입니다. 현재 수명주기 전용 모델 MCP에서는 C 조건을 실행할 수 없으며 preflight가 차단합니다. C를 CLI나 HTTP로 대체하면 다른 실험이 됩니다. 별도로 승인된 호환 런타임을 사용하거나 새 프로토콜로 실험을 준비하세요. 기존 기록은 당시 런타임의 근거로만 해석합니다. UI 동작 대기 시간 초과는 기능 실패로 집계하며, 브라우저 시작·연결 오류는 인프라 실패로 유지합니다.

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
`ui-tests/worktree/task.spec.ts`를 포함하며 프롬프트에 파일명을 명시합니다. 모든 조건의
HTTP 검증 테스트는 `integration/`에 작성하고 `APP_URL`을 사용합니다.
