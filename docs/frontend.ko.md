---
title: 프런트엔드 규칙
description: 실행 검토, 워크트리별 이력과 연결된 근거.
---

# 프런트엔드 규칙

기본 `app/web` 진입점은 연결된 실행 뷰어입니다. HTTP·데스크톱·App Page는 같은 검토
화면을 표시합니다. 모의·데모 화면은 백엔드 근거가 아닙니다. 서버 경계는
[아키텍처](architecture.md)에 설명합니다.

## 탐색과 식별

뷰어의 목적지는 정확한 실행 검토와 해당 워크트리 이력 두 가지입니다. 검토 URL은
`/?page=review&kind=unit|integration|playwright&id=<id>`입니다. 선택적인 기록의
project/worktree 매개변수는 실행 식별을 덮어쓰지 않습니다. 뷰어는 기록에서 식별을
해석합니다. 이력에는 명시적 워크트리 연결이 필요합니다. 새로고침과 브라우저
뒤로·앞으로가 목적지를 복원합니다. 실행 맥락이 없으면 채팅에서 기록을 열라는 빈 상태를 표시합니다.

프로젝트 선택기, 관리·설정 화면, 도구 메뉴, 테스트 실행 카탈로그, 수동 Container,
Git 화면이나 Copy handoff 제어는 없습니다. 호스트 대화가 작업 전환·설정·코드 변경을
담당합니다. 요청 검토에는 사람의 명시적 승인·취소 제어가 남으며 승인 전에 캡처된
미리보기를 보여야 합니다. capability·origin 규칙은 [인터페이스](interfaces.md)를 봅니다.

네이티브 호스트는 창 수명주기와 플랫폼 제어를 유지합니다. 설치·중지·복구 상태는
보조 셸에 속합니다. App Page는 같은 React 진입점과 App 전용 API·이벤트·산출물
브리지를 번들합니다. 글꼴과 아이콘은 내장하며 중첩 iframe이나 브라우저 네트워크
권한을 쓰지 않습니다. [설치](installation.md#로컬-redpact-app-page-실험)를 참고하세요.

## 컴포넌트와 시각 규칙

채택된 shadcn Base UI Nova 기본 컴포넌트, `render` 합성과 Base UI 이벤트를 사용합니다.
허용된 shadcnblocks 확장은 Linear 테마입니다. `src/components/ui`는 vendored 코드입니다.
무관한 수정 없이 합성하고 라이선스를 보존하세요. 의미 기반 테마 토큰과 UI의 Inter
Variable, 코드의 JetBrains Mono Variable 및 시스템 fallback을 사용합니다.
Prism은 로컬 GitHub PrettyLights `--code-highlight-*` 토큰을 사용합니다.

본문은 읽기 쉬운 14/21px, 페이지 제목은 24/32px, 구역 제목은 16/24px를 사용합니다.
제어 라벨은 간결한 13px입니다. 선택은 `accent`/`accent-foreground`로 표시하며 hover,
키보드 focus와 구분합니다. 장식 카드·중첩 테두리·그라데이션을 피하고 오류 색상과
전체 진단 내용을 보존하세요.

기록된 파일 이름은 내장 Material Icon Theme, 동작 아이콘은 Lucide를 사용합니다.
아이콘·제목·소스 표시로 테스트 결과를 추론하지 않습니다. 소스·산출물 조회는 일반
프로젝트 파일이 아닌 기록된 실행에 묶입니다.

## 레이아웃과 읽기 너비

검토와 이력은 일반 문서 스크롤을 사용합니다. 소스·로그 패널은 자체 스크롤 범위를
제한할 수 있습니다. flex/grid 경계에는 `min-w-0`, 제한된 중첩 스크롤에는 `min-h-0`를 둡니다. 공유하는 `640`,
`768`, `wide` 너비 정책을 유지합니다. 설명·근거 행은 768, 소스·특수 산출물은 가용
너비를 사용합니다. 모바일에서도 승인 제어·진단·소스 선택이 넘치거나 사라지면 안 됩니다.

소스 탐색은 선택한 내용 옆에 두고 필요하면 반응형 선택기를 사용합니다. 기록된 소스와
로그의 공백·줄바꿈·줄바꿈 모드 또는 가로 스크롤을 보존합니다. 소스 브라우저 전체를
바깥 카드로 감싸지 않습니다. 스크린샷은 시각 검토 근거입니다. 없는 산출물이나 읽기
실패를 명시하며 다른 실행의 이미지를 대신 보여주지 않습니다.

## 관찰, 로딩과 복구

네이티브 파일 이벤트가 범위별 무효화를 알립니다. 검토는 기록의 워크트리를 해석한 뒤
구독하며 이력도 같은 명시적 워크트리의 `scope=evidence`를 사용합니다. 검토 상태,
실행과 공유 설정을 포함합니다. 워크트리가 없는 과거 기록도 읽을 수 있으며 무관한
체크아웃을 대신 구독하지 않습니다. 검토 열기·새로고침은 실행을 요청하지 않습니다.

로딩·조회 실패 중에도 탐색을 유지합니다. 오류는 해당 근거나 동작 옆에 표시합니다.
오래된 근거를 빈 상태나 최신 결과로 바꾸지 않습니다. 취소·정리 결과를 테스트 판정과
분리하고 화면을 떠날 때 이벤트 구독을 해제합니다.

## 언어와 접근성

UI 문구는 내장 번역을 사용하고 식별자·원본 소스는 보존합니다. MCP 카드와 App Page는 호스트 모양을 따르며 독립 뷰어의 테마 선호가
App 호스트를 덮어쓰지 않습니다. 키보드 focus·선택 동작을 갖춘 의미 있는 버튼·라벨·탭·대화상자를
사용합니다. 테마와 소스 표시 방식은 뷰어 선호이며 프로젝트 실행 설정이 아닙니다.

화면 변경은 실제 앱에서 의미 있는 Playwright 조작으로 검증합니다. 레이아웃 변경에는
데스크톱·모바일 캡처도 확인합니다. 컴포넌트 테스트와 빌드는 보조 근거이며 검증하지
못한 상태를 보고해야 합니다.

## 문서화한 색상

구현은 [index.css](../app/web/src/index.css)가 소유합니다. 색상 회귀 검사는 아래 값을
확인하므로 의도적으로 변경할 때 양쪽을 함께 수정합니다.

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
