---
title: UX 내비게이션
description: 현재 앱의 페이지, 탭과 작업을 파일 트리 형식으로 정리합니다.
---

# UX 내비게이션

저장소 디렉터리나 URL 경로가 아닌 사용자 탐색 구조입니다. 화면과 대조할 수 있도록
메뉴 이름은 영어 UI 표기를 유지합니다. 실제 앱은 번역된 이름도 제공합니다.

`[페이지]`는 본문 이동, `[탭]`은 화면 안 전환, `[작업]`은 동작 실행,
`[대화상자]`는 overlay, `[섹션]`은 내용·제어 묶음입니다. 표식 없는 말단은 표시 내용입니다.

이 구조는 전체 브라우저·Global App Page에 적용됩니다. 채팅 MCP는 구조화된 결과와 웹 검토 링크를 제공하며 [프런트엔드 경계](frontend.md)를 따릅니다. 정확한 실행 링크도 전체 앱 안에서 사용할 수 있으며 프로젝트 탐색을 대체하지 않습니다.

## 화면 트리

```text
Redpact
├── 연결 / 시작
│   ├── 로컬 Redpact 연결 중
│   ├── 로컬 서버 연결 불가
│   │   └── Retry connection [작업]
│   └── 연결된 프로젝트 없음
│       ├── Open project folder [작업]
│       └── 프로젝트 관리 [대화상자]
│
├── 공용 앱 헤더
│   ├── Toggle Sidebar [작업]
│   ├── 현재 페이지 제목 / 탐색 / 작업 [섹션; 내용은 아래 페이지별 설명]
│   └── Play [작업; 사용 가능할 때 맨 오른쪽]
│
├── Sidebar
│   ├── 프로젝트 전환
│   │   ├── 연결된 프로젝트 선택 [작업]
│   │   ├── Connect project [작업]
│   │   └── 프로젝트 관리 [대화상자]
│   │       ├── 이름 또는 경로로 검색
│   │       ├── 연결됨 / 연결 해제됨 [탭]
│   │       ├── 연결 / 이름 변경 [대화상자]
│   │       ├── 열기 / 프로젝트 설정 [작업]
│   │       ├── 기록 보기 [대화상자]
│   │       ├── 연결 해제 [확인 대화상자]
│   │       └── 다시 연결 [작업]
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
│   │   │       │       ├── Test Code [탭]
│   │   │       │       └── Screenshots [탭]
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
│   │   │   └── Refresh [작업; 읽기 전용]
│   │   ├── Dependencies [페이지]
│   │   │   ├── Overview [탭]
│   │   │   │   └── 서비스 관계 → 선택한 서비스 상세
│   │   │   ├── Configuration [탭]
│   │   │   │   └── 모든 의존성 → 고정 정의 (선택 컨트롤 없음)
│   │   │   │       ├── Per-environment / Shared local / Remote connection / Mock
│   │   │   │       ├── Additional services
│   │   │   │       └── 환경 key-value override
│   │   │   └── Fixed dependencies and environment bindings [대화상자]
│   │   └── Project settings [페이지]
│   │       ├── General [섹션]
│   │       │   └── Git 프로젝트의 메인 브랜치 선택
│   │       ├── Application [섹션]
│   │       │   └── Compose files
│   │       ├── Unit [섹션]
│   │       │   └── Dockerfile, 명령, 작업 디렉터리와 파일 패턴
│   │       ├── Integration [섹션]
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
│   │   │   │       └── Desktop / Mobile 증거 선택 [뷰어 내부]
│   │   │   ├── Unit [탭; 조건부]
│   │   │   │   ├── 변경된 단위 테스트 파일 → Code / Command results
│   │   │   │   └── Run Tests / Cancel command [작업]
│   │   │   ├── Integration [탭; 조건부]
│   │   │   │   ├── 변경된 통합 테스트 파일 → Code / Execution results
│   │   │   │   └── Run Tests [작업; 최신 제출]
│   │   │   ├── Log [탭; 조건부]
│   │   │   │   └── 실행 이력과 복사 가능한 상세
│   │   │   └── Environment [탭; 조건부]
│   │   │       ├── 프로젝트 고정 실행 구성
│   │   │       └── 기록된 환경 상태, 리소스와 정리 제어
│   │   └── 실제 체크아웃 없는 선택 브랜치 [페이지; 선택 사항]
│   │       └── 커밋된 변경 파일 → 선택한 파일 diff
│   │
│   ├── GitHub repository [링크; 사이드바 하단 아이콘]
│   ├── Star on GitHub [링크; 사이드바 하단 아이콘]
│   ├── Update [작업; npm 새 버전만 표시]
│   └── Settings [페이지; 전역, 사이드바 하단 아이콘]
│       ├── 문제 목록 [섹션; 세션 진단과 명시적인 비우기 작업]
│       ├── Updates [섹션]
│       ├── 에이전트 플러그인 [섹션; 버전 확인 및 설치 확인]
│       │   └── Check for updates [작업; 설치 없음]
│       ├── Preferences [섹션]
│       │   ├── Theme: Light / Dark / System
│       │   ├── Word wrap
│       │   ├── Git 추적 파일만 표시 [스위치; 브라우저 로컬]
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

- 사이드바 하단은 Settings, GitHub, Star와 사용 가능한 Update 동작을 한 줄로
  배치합니다. Update는 텍스트 버튼이며 나머지 바로가기는 아이콘입니다. 접근 가능한 이름과 툴팁을 제공하고 Settings의 선택 상태를 유지합니다.
  GitHub와 Star는 공개 저장소를 새 브라우저 탭으로 열며,
  사용자는 GitHub에서 직접 Star를 추가합니다.

- 프로젝트 표시 옵션은 사용 가능한 메뉴를 모두 켠 상태로 시작합니다. 숨겨도 현재
  페이지와 작업은 유지하며 Worktrees와 전역 Settings는 계속 접근할 수 있습니다.
  표시 선택은 프로젝트별 브라우저 저장소에 기억합니다. 표시 옵션 버튼에는 숫자
  배지를 표시하지 않으며, 접근성 이름과 툴팁에는 숨긴 메뉴 수를 유지합니다.
  메뉴 체크박스나 **모두 표시**로 숨긴 항목을 복원할 수 있습니다.
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
  보여 줍니다. 뷰어의 Run 제어는 실행별 선택기 없이 공유 [실행 범위](configuration.md)를
  사용하며 에이전트는 API·CLI 요청에서 재정의할 수 있습니다. Unit은 설정 명령 또는
  명시적으로 설정한 `fileCommand`를 실행합니다. 워크트리 Integration은
  선택한 현재 파일이 아닌 최신 제출을 실행합니다.
- 프로젝트 Playwright 기록은 실제 기본 체크아웃이 없어도 볼 수 있습니다.
  프로젝트 Unit·Integration에는 그 체크아웃이 필요합니다. 브랜치 전용 검토는
  실행 제어 없이 커밋 diff만 보여 줍니다.
- Playwright는 현재 워크트리 캡처 초안과 변경된 프로젝트 캡처 파일을 실행 전에도 나열합니다.
  Desktop·Mobile은 최신 대응 실행의 이미지를 기록된 viewport로 필터링하며 소스 파일은 숨기지 않습니다.
  Mobile 스위치는 앱 헤더가 아닌 스크린샷 뷰어 안에 둡니다. 기능 결과는 Tests와 실행 이력에 있습니다.
  작업 초안 정리는 유지된 endpoint를 통해 에이전트가 명시적으로 수행하며 뷰어 버튼은
  제공하지 않습니다. 환경 수명주기 제어는 유지합니다.
- Container는 수동 유지 앱 환경이며 프로젝트 고정 실행 설정을 사용합니다.
  테스트 실행 증거와는 별개입니다.
- 공용 앱 헤더는 사이드바 전환, 현재 페이지의 제목 또는 탐색과 작업을
  모든 viewport에서 정확히 한 줄로 제공합니다. 사용 가능한 Play 실행 작업은 맨 오른쪽에
  둡니다. 비치명적 진단은 오른쪽 아래 알림으로 표시하며 누르면 기록을 지우지 않고
  알림만 닫습니다. 문제 상세와 목록 비우기는 전역 Settings에서 제공합니다.
  워크트리 리뷰 탭과 테스트 실행 작업도 이 공간에 표시합니다.
  Container·Tests·File Viewer·Git Graph·Dependencies·Project settings·전역 Settings가
  같은 헤더 공간을 사용합니다. 설정 양식의 저장·초안 복구 작업은 헤더에 두고
  섹션별 제어는 해당 섹션에 유지합니다. 파일별 탐색은 선택한 내용 옆에 남으며,
  Git Graph 내부의 브랜치·검색 제어는 graph 안에, Refresh는 앱 헤더에 둡니다.
  뷰어에는 Uncommitted·Merge·PR·Fetch 작업이 없으며 Git 쓰기와 게시는 에이전트가
  호스트 도구와 유지된 백엔드 workflow로 수행합니다. [Git 작업](git.md)과
  [헤더 레이아웃](frontend.md)을 참고하세요.
- 현재 프로젝트·페이지 하나를 표시하며 작업공간 탭이나 새 탭·탭 닫기 동작은 제공하지
  않습니다. 사이드바의 프로젝트·페이지·워크트리·브랜치 선택은 현재 목적지를 갱신합니다.
  다른 프로젝트를 선택하면 기본 리뷰 페이지를 엽니다. 브라우저 뒤로·앞으로는 연결된
  목적지를 복원하며, 새로고침은 초안·화면 상세 상태를 제외한 현재 위치를 복원합니다.
  같은 화면을 다시 선택해도 중복 기록을 추가하지 않고, 뒤로 이동한 뒤 새 화면을 선택하면
  앞으로 기록을 지웁니다. 파일 선택·리뷰 하위 탭·스크롤은 방문 기록을 추가하지 않습니다.
  페이지를 벗어나면 상태가 해제될 수 있으며 초안·DOM·구독을 유지하는 숨겨진 작업공간
  탭은 없습니다.
- 사이드바는 CSS 너비 1100px 이상에서 열린 상태로, 그보다 좁으면 접힌 상태로 시작합니다.
  이 경계를 넘으면 열림 상태를 갱신합니다. 공용 헤더의 전환 버튼은 계속 사용할 수 있으며
  CSS 너비 768px 미만에서는 모바일 drawer를 엽니다. Full·Half View·Mobile 모두
  헤더 한 줄과 고정된 사이드바 전환·사용 가능한 Play 작업을 유지하고, 필요할 때만 탐색·작업 그룹을
  각각 스크롤합니다. 헤더를 빽빽하게 채우기 전에 가치가 낮은 제어를 제거합니다.
  Half View는 사이드바를 고정 표시하지 않고 현재 페이지 본문에 너비를 배정합니다.
  데스크톱 Full 1920px과 Half View 800px을 모두 검증하고 캡처합니다. 모바일 캡처는
  별도로 요청한 경우에만 필요합니다.
- Worktrees 표시 옵션은 Worktrees 전체 영역의 호버, 키보드 포커스, 메뉴가 열린 동안과
  호버가 없는 입력 환경에서 나타납니다.
- 설정 섹션과 작업은 제공되는 API 기능에 따라 달라질 수 있습니다. MCP 승인 설정이
  별도 승인 받은편지함 페이지를 의미하지는 않습니다.

조합 규칙은 [프런트엔드](frontend.md), 수명주기는 [실행](execution.md)을 참고하세요.

Update 표시, 수동 확인과 설치 조건은 [런타임 업데이트](installation.md)를 참고하세요.
