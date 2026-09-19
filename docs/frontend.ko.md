---
title: 프런트엔드 규칙
description: 공유 시각 규칙, 내비게이션, 실시간 증거와 접근성을 설명합니다.
---

# 프런트엔드 규칙

기본 `app/web` 진입점은 연결된 뷰어이며 백엔드 명세나 데모가 아닙니다. 별도 데모
화면으로 실제 실행·승인 동작을 입증할 수 없습니다. 페이지 소유권은
[UX 내비게이션](ux-navigation.md), 서비스 경계는 [아키텍처](architecture.md)를 따릅니다.
스타일 전용 추상화가 실행 동작을 소유하지 않게 합니다.

## 컴포넌트와 시각 규칙

채택된 shadcn Base UI Nova primitive, `render` 조합과 Base UI event 계약을 사용합니다.
허용된 shadcnblocks 확장은 Linear 테마입니다. 관계없는 registry나 Radix primitive를
다시 도입하지 않습니다. 전문 Git tree·diff·syntax, Kibo list와 라이선스가 있는 ReUI
timeline은 현재 역할에 유지합니다.

`src/components/ui`는 vendored 코드입니다. 기능 작업에서는 조합해서 사용합니다.
공유 디자인 변경은 라이선스와 동작을 보존하며 이곳에서 밀도·형태를 한 번 조정할 수
있습니다. 화면마다 다른 override를 넣거나 관계없는 vendored 모듈을 수정하지 않습니다.
컴포넌트에서는 원시 색상이나 Tailwind palette 대신 의미 토큰을 사용합니다.
Redpact 색상과 번들 Inter Variable, 시스템 문자 fallback을 보존합니다. 코드·diff 표면은
번들 JetBrains Mono Variable을 먼저 사용하고 시스템 모노스페이스 fallback을 따릅니다.
Prism 문법 토큰은 로컬 `--code-highlight-*` 변수를 통해 완결된 GitHub PrettyLights
Light/Dark 팔레트를 사용합니다. 문법 패키지의 fallback 색상이나 화면별 문법 override에
의존하지 않습니다.

| 역할 | 형태와 글자 |
| --- | --- |
| 페이지 제목 | 24/32px, weight 600 |
| 섹션 제목 | 16/24px, weight 600 |
| 읽기 본문 | 14/21px 또는 긴 글의 16/24px |
| 제어·탐색 | 13px label. 작은 작업·메타데이터는 12px 가능 |
| 툴바 작업 | 28px pill 또는 원형 아이콘 제어 |
| 폼 입력·선택 | 편집 가능함이 드러나는 사각 면, 8px 모서리 |
| 사이드바 선택 | 부드러운 사각형, 8px 모서리 |
| 본문 frame·dialog | 12px 모서리와 절제된 경계·높이감 |
| 정적 badge·inline code | 밀도 있는 6px 모서리 |

형태는 역할에 따르며 모든 제어를 pill로 만들지 않습니다. 지속 선택은
`accent`/`accent-foreground`, hover는 더 옅은 임시 상태를 사용합니다. 선택 여부와
키보드 highlight를 구분합니다. 장식 카드, 중첩 경계, gradient, 행마다 박스를 만들지
않으며 작업 색상 반전과 의미 오류 색상을 보존합니다.

## 파일과 폴더 아이콘

File Viewer, 변경 파일 트리, 소스·diff 헤더는 React 아이콘 팩의 Material Icon
Theme SVG 자산을 번들로 사용합니다. 정확한 파일명이 확장자보다 우선하며,
`d.ts` 같은 복합 확장자는 `ts`보다 우선합니다. 알 수 없는 파일과 폴더는 테마의
기본 아이콘을 사용합니다. 폴더 아이콘은 이름과 펼침 상태를 반영하고, 밝은 테마용
변형은 기존 Light/Dark/System 설정을 따릅니다. 아이콘 색상은 앱 상태 색상이 아닌
원본 자산의 색상이며, Git 상태는 변경 파일 옆의 `A/M/D/R/C`와 행 수로 표시합니다.

Vite 빌드는 버전이 고정된 `material-icon-theme` 패키지에서 연결 정보를 생성하고
SVG 자산과 MIT 고지를 로컬에 포함합니다. CDN이나 런타임 매핑 생성은 필요하지
않습니다. 뷰어는 파일·폴더 이름을 사용하며, 편집기의 언어 ID 추론이나 사용자 지정
아이콘 매핑은 제공하지 않습니다. 작업 버튼의 아이콘은 계속 Lucide를 사용합니다.

## 파일 내용 미리보기

File Viewer, 워크트리 리뷰, 커밋된 브랜치와 Git Graph 비교, 미커밋 변경 대화상자는
같은 이미지 표시 방식을 사용합니다. PNG, JPEG, SVG, GIF, WebP, AVIF, BMP, ICO를
투명도 체크무늬 배경 위에 표시합니다. 실제 형식 지원은 브라우저 이미지 디코더에
따르며, 손상되거나 지원하지 않는 바이트는 디코딩 오류를 표시합니다. 이미지별
제한은 5 MiB이며 일반 UTF-8 소스 미리보기는 1 MiB 제한을 유지합니다.
지원하지 않는 바이너리는 명시적으로 표시합니다.

SVG는 Preview로 열리고 Source 탭에서 원문이나 비교 패치를 볼 수 있습니다.
소스만 제공하는 파일 화면도 같은 SVG 미리보기와 원본 전환을 사용합니다.
SVG를 문서에 삽입하지 않고 이미지로 불러오므로 스크립트는 실행되지 않으며
외부 SVG 리소스는 표시되지 않을 수 있습니다. 파일 선택 시 진행 중인 비교 읽기를
취소하며 새로고침 실패 시 다른 이미지를 현재 파일인 것처럼 남겨 두지 않습니다.

비교는 Before와 After를 충분히 넓은 작업 영역에서는 좌우로, 좁은 화면에서는
위아래로 표시합니다. 이미지가 없는 상태는 읽기·디코딩 오류와 구분합니다.
커밋과 브랜치 미리보기는 화면에 표시된 Git 리비전을 사용하고 이름이 바뀐 파일의
이전 경로를 보존합니다. Staged는 HEAD와 인덱스를, Unstaged는 인덱스와 작업 파일을
비교합니다. 미리보기를 여는 동작은 프로젝트 코드를 실행하지 않습니다.

## 레이아웃과 읽기 너비

앱 header는 둥근 본문 frame 밖에서 열린 작업공간 탭과 native drag 영역을
소유하며 현재 페이지 제목이나 history 제어를 반복하지 않습니다. 작업공간 탭은 고정 폭을
쓰고 긴 이름은 말줄임 처리하며 공간이 부족하면 가로로 스크롤합니다. 브라우저 데스크톱은
접기 제어 없이 사이드바를 연 상태로 유지하고, 좁은 모바일 화면에서는 사이드바 전환을
유지합니다. native macOS 데스크톱은 사이드바 제어를 유지합니다. 사이드바는 canvas에 남습니다. 데스크톱 gutter, 접힘 상태, 모바일 전체
너비와 macOS toolbar 위치를 보존합니다. 앱이 viewport 높이를 소유하고 증거·목록은
각 panel에서 스크롤합니다. Flex/grid 경계에 `min-w-0`, 중첩 스크롤에는 `min-h-0`가 필요합니다.

index.css의 공유 너비 정책 `640`, `768`, `wide`만 사용합니다. 설정은 640, 본문·증거
행은 768, 전문 파일·diff·graph는 가용 너비를 사용합니다. 고정 사용자 너비가 아닌
반응형 최대치입니다. 설정 gutter는 읽기 열 밖에 둡니다. 파일 뷰어, 워크트리·브랜치 diff,
테스트 파일 탐색기는 내부 카드나 바깥 여백, 이중 둥근 테두리 없이 본문 frame을 채웁니다.
페이지 툴바와 파일 헤더는 아래 구분선을 사용하고 파일 탐색은 panel 사이 선으로 구분합니다.
여백은 탐색기 전체가 아니라 읽기·결과 내용 안에 둡니다. 파일 탐색은 선택 내용 옆에
유지하고 필요한 경우 반응형 picker를 사용합니다.

Log는 두 줄의 연속 행으로 전체 의도, 종류·판정·현지 시각과 가까운 복사 작업을 배치합니다.
환경·의존성은 읽기 쉬운 수직 행과 제한된 key/value 표를 사용합니다. 공백, 실제 줄바꿈,
전체 진단을 보존하고 글자를 줄여 panel에 맞추지 않습니다. Diff·소스는 전역 Word wrap을
사용하며 해제하면 가로 스크롤합니다.

Redpact 밖의 도움이 필요한 복구 상태는 해당 view가 구체적인 제목·요약·구조화한 맥락을
담은 `CopyHandoff`를 사용합니다. 계속 작업하는 데 필요한 식별자, 관찰 상태, 선택값,
보존 리소스 참조를 포함합니다. 진단 파일 내용은 로컬 접근 경계 안에 두고 로그나 secret을
자동으로 client에 보내지 않으며, 보존된 위치만 복사합니다. 머지와 환경 복구는 이 shell을
공유하되 같은 복구 지시문으로 강제하지 않습니다.
이 shell은 제목, Copy 동작, 선택 가능한 복사 본문, 클립보드 실패 fallback, 선택 가능한
라벨형 상세 disclosure의 규격을 통일합니다. 일반적인 agent handoff 라벨을 붙이거나 서로
다른 복구 내용을 하나의 텍스트 template으로 강제하지 마세요.

모든 destructive `Notice`는 문제 상태이므로 같은 shell을 자동으로 사용합니다. 화면에
보이는 진단을 **문제 상세**의 복사 가능한 맥락으로 넣어 사용자가 즉시 handoff할 수
있게 합니다. 진단은 화면에 한 번만 표시하고, 형식화된 복사 텍스트는 클립보드 접근이
실패할 때만 나타납니다. 지속 식별자, 선택값 또는 보존 리소스가 있는 화면은 이 fallback에
의존하지 않고 계속 자체적인 구체적 `CopyHandoff` 맥락을 제공합니다.

## 하나의 검토 툴바

페이지는 navigation·secondary·actions slot을 가진 `ReviewToolbar` 하나를 소유합니다.
프로젝트 Tests가 Unit·Integration·Playwright를 제공하고 활성 Playwright가 같은 툴바에
Screenshots·Tests·Runs와 실행 작업을 제공합니다. 파일별 Code·Results는 파일 panel에
남습니다. 좁은 너비에서 제어는 줄바꿈하고 탐색 그룹은 자체 overflow를 소유합니다.

관련 영역을 `ReviewToolbarScope`로 감쌉니다. Scope당 활성 `ReviewToolbarOverride`는
하나이며 중첩 scope는 독립적입니다. 비활성 override는 unmount합니다. 생략한 slot은
상속, `null`은 숨김, 전달한 내용은 대체입니다. Unmount하면 기본값을 복원합니다.
공유 컴포넌트가 portal과 tab context를 소유하며 화면은 effect로 React node를 등록하거나
다른 페이지 툴바를 추가하지 않습니다.

워크트리 리뷰는 Playwright의 Mobile 및 Run Playwright 컨트롤을 포함해 탐색 탭을 왼쪽,
액션을 오른쪽의 한 줄에 유지합니다. 공간이 부족하면 각 영역을 가로로 스크롤하며,
라벨은 기존 글자 크기를 유지하고 줄바꿈하지 않습니다.

## 관찰, 로딩과 복구

Native 파일 이벤트는 범위별 서버 갱신으로 합쳐집니다. 비싼 refresh 작업은 대상별로
제한하고 관계없는 이벤트로 변경 없는 프로젝트를 다시 스캔하지 않습니다. Watcher는
범위와 함께 해제하고 리소스 실패를 명시적으로 복구합니다. 뷰어는 범위별 SSE를 구독해
해당 query를 갱신합니다. 열기·관찰은 테스트를 시작하지 않습니다. 수동 Container는
페이지가 열려 있는 동안 상태와 입력 식별자를 별도로 polling합니다.

로딩·빈 화면·읽기 실패 중에도 탐색을 유지합니다. 내용이 남아 있으면 활성 tab을
보존하며, 비어 있음이 확인된 워크트리 section만 숨깁니다. 오류와 실행·정리는 접근
가능해야 합니다. 오래된 증거에는 진단을 표시하며 거짓 빈 상태나 최신 결과로 바꾸지
않습니다. 공유 live-update 구성 요소를 사용하고 나갈 때 구독을 해제합니다.
복구를 소유하는 작업·내용 옆에 오류를 둡니다.

## 언어와 접근성

UI copy는 번들 locale catalog로 번역하고 식별자와 원문은 보존합니다. 테마는
Light·Dark·System이며 줄바꿈 기본값은 켜짐입니다. 브라우저 저장 실패 시 세션 동작을
허용합니다. MCP 카드는 host 외형을 따릅니다. 모두 프로젝트 설정 필드가 아닙니다.

의미 있는 button·label·tab·dialog와 키보드 focus·selection을 사용합니다.
반응형 reflow에서도 제어, 파일 선택과 진단을 보존합니다. 화면 변경에는 실제 앱의
기능 Playwright 테스트를 수행합니다. 배치·스타일 변경은 데스크톱·모바일 캡처도 확인합니다.
컴포넌트·구조·빌드 검사는 이를 보조하며 대체하지 않습니다.

## 문서화된 색상

CSS 구현은 [index.css](../app/web/src/index.css)에 있습니다. Palette 대조 회귀 테스트가
아래 값을 확인합니다. 의도적으로 디자인을 바꾸면 양쪽을 함께 수정합니다.
다른 토큰 상세는 별도 수동 디자인 registry가 아닌 CSS에서 관리합니다.

```yaml
colors:
  background: "#fbfbfb"
  foreground: "#1b1b1b"
  card: "#ffffff"
  primary: "#6e78d5"
  primary-foreground: "#ffffff"
  secondary: "#1b1b1b"
  secondary-foreground: "#fbfbfb"
  muted: "#ececef"
  muted-foreground: "#71737a"
  accent: "#d9dcea"
  accent-foreground: "#000000"
  destructive: "#92681b"
  border: "#e8e8e8"
  input: "#bebfc3"
  ring: "#6f6d6d"
  sidebar: "#fbfbfb"
  sidebar-foreground: "#000000"
  sidebar-primary: "#535151"
  sidebar-accent: "var(--accent)"
  chart-1: "#6d6b6b"
  chart-2: "#02755c"
  chart-3: "#a3a1a1"
  chart-4: "#004a37"
  chart-5: "#3b3939"
  dark-background: "#101011"
  dark-foreground: "#e3e4e6"
  dark-card: "#17181a"
  dark-primary: "#e6e6e6"
  dark-secondary: "#7987e1"
  dark-muted: "#141415"
  dark-muted-foreground: "#a1a2a5"
  dark-accent: "#303549"
  dark-border: "#24252a"
  dark-sidebar: "#08090a"
typography:
  sans: Inter Variable
```
