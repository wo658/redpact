---
title: UX 내비게이션
description: 현재 앱의 페이지, 탭과 작업을 파일 트리 형식으로 정리합니다.
---

# UX 내비게이션

저장소 디렉터리나 URL 경로가 아닌 사용자 탐색 구조입니다. 화면과 대조할 수 있도록
메뉴 이름은 영어 UI 표기를 유지합니다. 실제 앱은 번역된 이름도 제공합니다.

`[페이지]`는 본문 이동, `[탭]`은 화면 안 전환, `[작업]`은 동작 실행,
`[대화상자]`는 overlay, `[섹션]`은 내용·제어 묶음입니다. 표식 없는 말단은 표시 내용입니다.

## 화면 트리

```text
Redpact
├── 연결 / 시작
│   ├── 로컬 Redpact 연결 중
│   ├── 로컬 서버 연결 불가
│   │   └── Retry connection [작업]
│   └── 연결된 프로젝트 없음
│       └── Open project folder [작업]
│
├── 앱 헤더
│   ├── 새 탭 [작업]
│   └── 열린 작업공간 탭 [탭]
│       ├── 연결된 프로젝트 [탭]
│       └── 선택한 worktree [탭]
│
├── Sidebar
│   ├── 프로젝트 전환
│   │   ├── 연결된 프로젝트 선택 [작업]
│   │   └── Connect project [작업]
│   ├── 프로젝트 표시 옵션
│   │   ├── 사용 가능한 프로젝트 메뉴별 표시 / 숨김 [작업]
│   │   └── Show all [작업]
│   │
│   ├── 선택한 프로젝트
│   │   ├── Container [페이지]
│   │   │   ├── 대상 체크아웃과 입력 최신성
│   │   │   ├── 수동 환경 상태와 리소스
│   │   │   ├── 애플리케이션 링크 / 공개 endpoint
│   │   │   └── Start / Restart / Stop [작업]
│   │   │
│   │   ├── Tests [페이지]
│   │   │   ├── Unit [탭]
│   │   │   │   ├── 단위 테스트 파일 목록
│   │   │   │   ├── Code [탭]
│   │   │   │   ├── Command results [탭]
│   │   │   │   │   └── 명령 이력, 상태, stdout와 stderr
│   │   │   │   └── Run Tests / Cancel command [작업]
│   │   │   ├── Integration [탭]
│   │   │   │   ├── 통합 테스트 파일 목록
│   │   │   │   ├── Code [탭]
│   │   │   │   ├── Execution results [탭]
│   │   │   │   │   └── 기록된 케이스, 단계와 판정
│   │   │   │   └── Run Tests [작업]
│   │   │   └── Playwright [탭]
│   │   │       ├── Screenshots [탭]
│   │   │       │   └── 선택한 캡처 파일
│   │   │       │       ├── Preview [탭]
│   │   │       │       └── Test Code [탭]
│   │   │       ├── Tests [탭]
│   │   │       │   └── 선택한 기능 테스트 파일
│   │   │       │       ├── Code [탭]
│   │   │       │       └── Execution results [탭]
│   │   │       ├── Runs [탭]
│   │   │       │   └── 선택한 기록 실행
│   │   │       │       ├── Execution results [탭]
│   │   │       │       └── Test Code [탭]
│   │   │       └── Playwright 실행 제어 [작업]
│   │   │
│   │   ├── File Viewer [페이지]
│   │   │   └── 파일 트리 → 선택한 파일 소스 또는 이미지 미리보기
│   │   │       └── SVG Preview / Source [탭]
│   │   ├── Git Graph [페이지; Git 프로젝트]
│   │   │   ├── 브랜치 필터, 원격 표시, 로드된 커밋 검색
│   │   │   ├── 커밋 이력 → 선택 커밋 → 변경 파일 → diff
│   │   │   └── Fetch [작업]
│   │   ├── Dependencies [페이지]
│   │   │   ├── Overview [탭]
│   │   │   │   └── 서비스 관계 → 선택한 서비스 상세
│   │   │   ├── Configuration [탭]
│   │   │   │   └── 선택한 의존성 → 고정 종류
│   │   │   │       ├── Per-environment / Shared local / Remote connection / Mock
│   │   │   │       ├── Additional services
│   │   │   │       └── 환경 override와 비밀값 입력
│   │   │   └── Fixed dependencies and environment bindings [대화상자]
│   │   └── Project settings [페이지]
│   │       ├── General [섹션]
│   │       │   └── Git 프로젝트의 메인 브랜치 선택
│   │       ├── Application [섹션]
│   │       │   └── Compose files
│   │       ├── Unit Test [섹션]
│   │       │   └── Dockerfile, 명령, 작업 디렉터리와 파일 패턴
│   │       ├── Integration Test [섹션]
│   │       │   └── 디렉터리, 테스트·hook timeout과 테스트 환경
│   │       ├── Playwright [섹션]
│   │       │   └── 앱 연결, 시나리오, 타깃과 브라우저 옵션
│   │       └── Save settings / Reload or discard conflicting draft [작업]
│   │
│   ├── Worktrees
│   │   ├── Worktree display options
│   │   │   ├── Worktrees only / Include local branches
│   │   │   └── Hide merged worktrees
│   │   ├── 선택한 실제 워크트리 [페이지]
│   │   │   ├── Diff [탭; 조건부]
│   │   │   │   └── 변경 파일 목록 → 선택한 파일 diff
│   │   │   ├── Playwright [탭; 조건부]
│   │   │   │   └── 캡처 파일 목록 → 기록된 PNG checkpoint
│   │   │   │       └── Desktop / Mobile 증거 선택
│   │   │   ├── Unit Test [탭; 조건부]
│   │   │   │   ├── 변경된 단위 테스트 파일 → Code / Command results
│   │   │   │   └── Run Tests / Cancel command [작업]
│   │   │   ├── Integration Test [탭; 조건부]
│   │   │   │   ├── 변경된 통합 테스트 파일 → Code / Execution results
│   │   │   │   └── Run Tests [작업; 최신 제출]
│   │   │   ├── Log [탭; 조건부]
│   │   │   │   └── 실행 이력과 복사 가능한 상세
│   │   │   ├── Environment [탭; 조건부]
│   │   │   │   ├── 프로젝트 고정 실행 구성
│   │   │   │   └── 기록된 환경 상태, 리소스와 정리 제어
│   │   │   └── Git 툴바 작업
│   │   │       ├── Uncommitted [대화상자; 변경사항이 있을 때만]
│   │   │       │   ├── 파일 diff
│   │   │       │   ├── Commit all changes [작업]
│   │   │       │   └── Discard all listed changes [확인 대화상자]
│   │   │       ├── Merge [대화상자 / 작업]
│   │   │       └── Pull request 게시 [대화상자 / 작업]
│   │   └── 실제 체크아웃 없는 선택 브랜치 [페이지; 선택 사항]
│   │       └── 커밋된 변경 파일 → 선택한 파일 diff
│   │
│   ├── GitHub repository [링크; 사이드바 하단 아이콘]
│   ├── Star on GitHub [링크; 사이드바 하단 아이콘]
│   ├── Check for updates / Update [작업; 데스크톱 하단 아이콘]
│   └── Settings [페이지; 전역, 사이드바 하단 아이콘]
│       ├── Preferences [섹션]
│       │   ├── Theme: Light / Dark / System
│       │   ├── Word wrap
│       │   └── Language
│       ├── Integrations [섹션]
│       │   └── GitHub connection check
│       ├── Automation [섹션]
│       │   └── MCP approval: Auto / Ask first
│       └── Instance configuration [섹션]
│           ├── Managed environment concurrency
│           ├── Test memory and execution time limits
│           ├── Server port
│           ├── Observed project directories
│           ├── GitHub CLI path
│           └── Save settings [작업]
```

## 탐색 동작

- 사이드바 하단은 Settings, GitHub, Star와 데스크톱 업데이트 동작을 작은 아이콘 한 줄로
  배치합니다. 접근 가능한 이름과 툴팁을 제공하고 Settings의 선택 상태를 유지합니다.
  GitHub와 Star는 공개 저장소를 새 브라우저 탭 또는 데스크톱 기본 브라우저로 열며,
  사용자는 GitHub에서 직접 Star를 추가합니다.

- 프로젝트 표시 옵션은 사용 가능한 메뉴를 모두 켠 상태로 시작합니다. 숨겨도 현재
  페이지와 작업은 유지하며 Worktrees와 전역 Settings는 계속 접근할 수 있습니다.
  표시 선택은 프로젝트별 브라우저 저장소에 기억합니다.
- 워크트리는 비어 있음이 확인된 탭만 숨깁니다. 오류·진단·활성 실행·정리는 접근 가능해야
  합니다. 선택 탭이 사라지면 첫 가용 탭으로, 아무 내용도 없으면 하나의 빈 상태로 이동합니다.
- 워크트리 탭 존재 여부는 `GET /api/worktrees/:id/review-content`로 조회합니다.
  변경 경로 조회를 공유하는 메타데이터 요청 하나이며 소스 본문 읽기, 앱 fingerprint
  계산, Docker 호출을 하지 않습니다. 최초 존재 여부 응답이 도착하면 탭을 표시하며,
  이후 백그라운드 갱신 중에는 다음 응답까지 현재 헤더를 유지합니다.
  상세 패널은 열 때 내용을 조회합니다.
  변경 파일이 없으면 완료된 과거 제출만으로 Integration 탭을 표시하지 않습니다.
  활성 실행과 진단은 계속 접근할 수 있으며 보관된 실행 이력은 Log에 남습니다.
- 프로젝트 Unit·Integration은 기본 체크아웃 전체 목록을, 워크트리는 변경 파일을
  보여 줍니다. Unit은 전체 설정 명령을, 워크트리 Integration은 선택한 현재 파일이
  아닌 최신 제출을 실행합니다.
- 프로젝트 Playwright 기록은 실제 기본 체크아웃이 없어도 볼 수 있습니다.
  프로젝트 Unit·Integration에는 그 체크아웃이 필요합니다. 브랜치 전용 검토는
  실행 제어 없이 커밋 diff만 보여 줍니다.
- Playwright는 현재 워크트리 캡처 초안과 변경된 프로젝트 캡처 파일을 실행 전에도 나열합니다.
  Desktop·Mobile은 최신 대응 실행의 이미지를 기록된 viewport로 필터링하며 소스 파일은 숨기지 않습니다. 기능 결과는 Tests와 실행 이력에 있습니다.
- Container는 수동 유지 앱 환경이며 프로젝트 고정 실행 설정을 사용합니다.
  테스트 실행 증거와는 별개입니다.
- 브라우저 데스크톱은 사이드바를 연 상태로 유지하며, 헤더에는 사이드바 전환, 페이지
  제목이나 이력 제어 대신 열린 작업공간 탭만 둡니다. 좁은 모바일 화면은 사이드바 전환을
  유지하고 native macOS 데스크톱은 사이드바 제어를 유지합니다. 작업공간 탭은 고정 폭을
  사용하고 긴 레이블은 말줄임 처리합니다. 프로젝트 선택은
  해당 프로젝트 탭을 열거나 활성화하고, worktree 선택은 worktree 탭을 추가합니다.
  탭을 닫아도 탭 표시만 사라지며 실행을 중지하거나 프로젝트 연결을 해제하지 않습니다.
- 헤더 더하기 버튼은 기존 탭을 유지한 채 현재 프로젝트의 기본 리뷰 화면을 새 프로젝트
  탭으로 엽니다. 각 열린 탭은 전환 중 사이드바와 현재 화면의 상태를 유지합니다. 폴더 펼침, 파일 선택,
  Test 하위 탭, 작성 중인 입력과 스크롤 위치를 포함합니다. 숨긴 탭은 구독을 중지하고
  다시 활성화할 때 갱신합니다. 탭을 닫으면 해당 상태를 해제합니다. 새 탭은 현재
  세션에만 유지되며 새로고침하면 탭 목록이 초기화됩니다. 아이콘과 제목은 왼쪽에
  정렬하고 탭마다 얇은 윤곽선을 표시합니다.
- 설정 섹션과 작업은 제공되는 API 기능에 따라 달라질 수 있습니다. MCP 승인 설정이
  별도 승인 받은편지함 페이지를 의미하지는 않습니다.

조합 규칙은 [프런트엔드](frontend.md), 수명주기는 [실행](execution.md)을 참고하세요.

데스크톱 Update 표시와 설치 조건은 [데스크톱 업데이트](desktop.ko.md)를 참고하세요.
