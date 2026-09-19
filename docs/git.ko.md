---
title: 프로젝트와 Git
description: 체크아웃 발견, 비교, 생성, 로컬 머지와 GitHub 게시를 설명합니다.
---

# 프로젝트와 Git

## 식별과 발견

프로젝트는 저장소와 그 안의 상대 프로젝트 경로, 또는 연결된 일반 디렉터리입니다.
워크트리는 실제 체크아웃 하나를 식별합니다. 기본 체크아웃과 연결된 체크아웃은
프로젝트 규칙을 공유합니다. Native Git 등록에서 현재 가용성을 확인하며 브랜치 변경이
과거 실행 식별자를 바꾸지는 않습니다. 일반 디렉터리가 Git 저장소가 되면 관찰로 인식합니다.

폴더 열기는 native 디렉터리 선택기를 사용합니다. 폴더 선택과 Git 발견은 브랜치 생성,
프로젝트 코드 실행, 컨테이너 준비를 하지 않습니다. 인스턴스의 관찰 루트가 발견 범위를
정합니다. 삭제된 폴더의 결과는 남지만 실행할 수 없습니다. 체크아웃 없는 브랜치 항목은
체크아웃 생성이나 실행 제어 없이 커밋된 변경만 보여 줍니다.

`tracking.json`은 비교 메인 브랜치와 표시 설정을 소유합니다. 메인과 변경된 워크트리의
표시는 tracking 서비스 규칙을 따릅니다. 로컬 브랜치 포함은 선택 사항이며 실제 워크트리
항목을 중복하지 않고 보충합니다.

## 읽기 전용 비교

Native Git이 모든 index 형식의 상태와 중첩·전역·공유 제외 규칙을 담당합니다.
추적 파일은 ignore 규칙에 맞아도 변경이 보입니다. 지원되는 HEAD/index blob 읽기는
isomorphic-git과 native fallback을 유지합니다. 검사 시 외부 diff, textconv, hook,
optional lock, fsmonitor를 비활성화하며 저장소 상대 경로를 검증합니다.

워크트리 검토는 사용 가능한 브랜치 생성 reflog commit을 기준으로, 없으면 설정한
메인 브랜치 merge base를 기준으로 비교합니다. 커밋·staged·unstaged·untracked 변경을
포함합니다. 비교 상태가 없거나 모호하면 빈 diff 대신 진단을 반환합니다.
브랜치 전용 비교는 커밋된 변경만 포함합니다. 소스·diff 줄바꿈은 전역 표시 설정이며
원문, 줄 번호와 통계를 보존합니다.

이미지 비교는 [공통 파일 미리보기 규약](frontend.ko.md)을 따르며, 명시적인 커밋
리비전과 이름 변경 경로를 사용하고 staged/unstaged 바이트를 구분합니다.

## Git Graph와 Fetch

Git Graph는 제한된 커밋 목록, 브랜치 필터, 원격 표시, 로드된 커밋 검색과 선택한
커밋의 파일 diff를 제공합니다. 열기와 탐색은 읽기 전용입니다. 명시적 Fetch는 설정된
원격의 destination refspec으로 remote-tracking branch를 갱신합니다. 머지·push·prune·
tag fetch나 로컬 브랜치·index·파일 변경은 하지 않습니다. common Git 디렉터리별로
직렬화하고 원격 누락, 사용 중 상태, 부분 실패를 보고합니다. 성공·실패 뒤 모두 목록을
갱신합니다. 이 툴바에는 Pull과 Push가 없습니다.

## 관리되는 워크트리 생성

`POST /api/work-starts`는 `requestId`, `projectId`, `intent`, `baseRef`, `branch`와 절대
`path`를 받습니다. 별도 native Git adapter 작업이며 검사의 부작용이 아닙니다.
체크아웃을 생성·연결하기 전에 원본 revision과 계획된 식별자를 고정합니다.
`GET /api/work-starts/:id`에서 복구 진행 상태를 확인합니다.

같은 요청 ID와 입력은 같은 작업을 복구하며 다른 입력은 충돌합니다. 기존 브랜치·경로
충돌은 자동 제거하지 않고 검사합니다. 부분 생성은 내구성 있는 상태를 남기며 관찰하지
않은 결과를 주장하지 않습니다. 보존할 워크트리는 프로젝트 소유 경로에 두고 `/tmp`는
폐기 가능한 테스트 fixture에만 사용합니다.

## 로컬 커밋과 머지

툴바는 Commit·Discard 전에 미커밋 변경을 검사합니다. Commit은 검사한 staged,
unstaged, untracked 변경을 포함합니다. Discard에는 명시적 확인이 필요하며 목록의
untracked 파일을 지울 수 있습니다. 검사 후 변경은 최신성 검사에서 거부하고 두 작업
뒤 자동으로 머지하지 않습니다.

Merge는 설정한 메인 브랜치의 실제 체크아웃을 대상으로 합니다. 소스·대상의 미커밋
변경, 오래된 revision, 미해결 상태는 수락을 막습니다. 후보 충돌을 소스·대상 파일과
분리합니다. 영속 attempt는 입력 HEAD와 결과를 보존하며 동일 요청의 재시도는 멱등적입니다.
중단·충돌은 상태 확인과 복구가 필요하며 맹목적 반복이나 브랜치 삭제로 처리하지 않습니다.

| HTTP | 작업 |
| --- | --- |
| `GET /api/worktrees/:id/merge` | 소스·대상·차단 이유·이력 확인 |
| `POST /api/worktrees/:id/git/commit` | 검사한 `{ revision, message }` 커밋 |
| `POST /api/worktrees/:id/git/discard` | 확인 후 검사한 `{ revision }` 폐기 |
| `POST /api/worktrees/:id/merge` | `{ requestId, sourceRevision, targetRevision }` 머지 |

충돌을 해결하는 에이전트는 소스 체크아웃에서 대상을 다시 확인하고, 테스트와 커밋 후
다음 승인된 머지를 진행합니다. 테스트 승인은 Git 머지 승인이 아닙니다.
의존성 overlay는 별도의 [검토된 승격 절차](settings-reference.md)가 필요합니다.

## GitHub pull request

PR은 소스, origin, GitHub 기본 base 브랜치를 보여 주는 폼을 엽니다. 열기만으로
push하지 않습니다. 게시에는 깨끗한 named non-default 브랜치와 지원되는 동일 저장소
주소의 github.com origin이 필요합니다. 인증된 `gh`와 Git 자격 증명을 재사용하며
토큰을 저장하거나 별도 인증 체계를 번들하지 않습니다. 전역 Settings에서 절대
`github.cliPath`를 지정하고 연결을 확인할 수 있습니다.

Publish는 검사한 SHA를 같은 origin 브랜치로 force·tag 없이 push한 다음 PR을 만듭니다.
같은 head/base의 열린 PR은 재사용합니다. Push to PR은 제목·본문을 바꾸지 않습니다.
소스, revision, 목적지를 다시 검사합니다. push 성공 후 PR 생성 여부가 불명확하면
별도로 보고하고 재시도는 기존 PR을 먼저 찾습니다.

게시가 머지·자동 커밋·fork·브랜치 삭제를 하지는 않습니다. Enterprise host, SSH 별칭,
fork target, 모호한 origin URL은 현재 adapter 범위 밖입니다. GitHub 기본 PR base와
로컬 Merge 대상은 독립적입니다. GitHub가 PR 식별자를 소유하며 로컬 PR DB는 없습니다.
종료 시 진행 중인 게시를 기다립니다.

구현: [Git adapters](../app/server/src/adapters/git),
[Merge workflow](../app/server/src/workflows/merge.ts),
[PR workflow](../app/server/src/workflows/pull-requests.ts),
[GitHub adapter](../app/server/src/adapters/github/pull-requests.ts).
