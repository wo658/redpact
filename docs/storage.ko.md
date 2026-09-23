---
title: 런타임 데이터와 복구
description: 레코드 식별자, 아티팩트 소유권과 파일 영속성 규칙을 설명합니다.
---

# 런타임 데이터와 복구

## 목적별 정본

현재 코드는 체크아웃 파일과 Git이, 미래 설정은 프로젝트 설정 파일이 소유합니다.
수락된 입력과 관찰된 실행 이력은 런타임 레코드가 소유합니다. 캡처한 설정은 과거 실행을
설명하며 두 번째 편집 가능 설정 레지스트리가 아닙니다.
작성 파일은 [설정 소유권](settings-reference.md)에서 정의합니다.

데이터 디렉터리 하나는 고유 식별자와 writer 하나를 가진 로컬 인스턴스입니다.
범용 DB 추상화 대신 JSON과 일반 아티팩트 파일을 사용합니다. 미출시 제품이므로 각
레코드의 현재 형식만 지원하며 이전 형식 reader나 호환성 마이그레이션은 없습니다.
개발 데이터 초기화는 명시적 작업이어야 하며 몰래 수행하는 복구 전략이 아닙니다.

## 레코드

Project 레코드는 불변 식별자·위치와 함께 표시 이름과 선택적 `disconnectedAt` 시각을
저장합니다. 연결 해제로 증거, 자격 증명, 워크트리나 소스 파일을 연쇄 삭제하지 않습니다.
재연결은 같은 레코드에서 해당 시각을 제거합니다. [프로젝트 관리](git.md)를 참고하세요.

| 레코드 | 의미 |
| --- | --- |
| Project | 연결된 저장소·하위 디렉터리 또는 일반 디렉터리 식별 |
| Worktree | 과거 체크아웃 식별과 프로젝트 연결 |
| Work item | 해당 프로젝트·워크트리의 캡처된 작업 의도 |
| Submission | 불변 테스트·helper 소스, digest, 파싱한 의도와 실행기 식별 |
| Integration run | 제출, 수락한 대상·설정·Git, 실행 상태와 결과 |
| Environment | 고정 서비스·의존성 종류, 소스 식별, 소유 리소스와 수명주기 |
| Work start | 관리 체크아웃 생성 입력과 계획 결과의 영속 기록 |
| Review | 캡처된 MCP 정책·승인·캡처된 구성·revision과 실행 연결 |
| Unit run | 명령·런타임 식별, 출력, 최종 상태와 정리 상태 |
| Playwright run | 타깃·시나리오 결과와 브라우저 아티팩트 |
| Merge attempt | 검사한 소스·대상 식별자, 진행과 복구 결과 |

Work item은 제출 여러 개를, 제출은 실행 여러 개를 가질 수 있습니다. 새 관리 실행마다
자체 환경을 사용합니다. 수동 환경에는 run ID가 없으며 실행 증거가 아닙니다.
ID와 복사된 대상 연결은 일치해야 하지만 DB foreign key나 파일 간 트랜잭션은 없습니다.

## 물리적 소유권

```text
<data-dir>/
├── instance.json, settings.json
├── projects/, worktrees/, work-items/, submissions/
├── work-starts/, reviews/, unit-runs/, merges/
├── runs/<id>/
│   ├── state.json
│   ├── source/, report.json, vitest.config.mjs
│   └── connections.json, stdout.log, stderr.log
├── environments/
│   ├── <id>.json
│   └── <id>/                         # 준비 로그와 임시 입력
├── playwright-runs/                  # Playwright 레코드와 아티팩트
└── .writer.lock
```

정확한 현재 레이아웃과 버전은 storage adapter가 정의합니다. 트리는 내보내기 스키마가
아닌 소유권 설명입니다. 리소스 ID·endpoint·서비스 관찰값은 환경에 포함되는 증거이며
독립 관리 엔티티가 아닙니다. Docker와 앱 데이터는 파일 밖에 있으며 Redpact가 백업하지 않습니다.

## 저장과 복구

비공개 임시 파일에 쓴 뒤 완전한 레코드를 원자적으로 rename합니다. 불변 레코드는
덮어쓰지 않습니다. 형식·부모 연결·식별 불변식을 검사하고 손상은 초기화나 생략 대신
보고합니다. Writer lock은 프로세스 소유권을 기록합니다. 살아 있거나 알 수 없는
프로세스의 lock을 빼앗지 않습니다.

예약, 실행 저장과 리소스 생성은 파일·프로세스 경계를 넘습니다. 부분 완료를 대조할
수 있도록 작업별 상태를 보존합니다. 복구는 실행 증거를 꾸미거나 수락한 입력의 대상을
바꾸거나 불확실한 시작을 재실행하면 안 됩니다. 대기 승인은 재시작 후에도 남으며
불확실한 starting 요청은 interrupted가 되어 확인을 요구합니다. 정리 중에도 최종 판정은 유지합니다.

환경 종료는 소유 런타임 리소스와 캡처 소스·런타임 파일을 제거하고 메타데이터와 로그를
보존합니다. Unit은 실행별 이미지를 제거하고 Playwright는 공유 러너 이미지를 유지한 채 캡처 컨테이너를 제거합니다. 워크트리가 사라져도
과거 결과는 남습니다. 임시 Compose 빌드 이미지는 환경과 함께 제거하지만 Docker 빌드 캐시와
명시적으로 이름 붙인 프로젝트 이미지는 prune하지 않습니다. 일반 자동 증거 보관·삭제 정책을
의미하지 않으며, 참조된 레코드를 수동 삭제하면 이를 사용하는 데이터가 깨질 수 있습니다.

## 비공개 값과 증거

프로젝트 비밀값은 비공개 인스턴스 저장소에 있고 서버 환경 fallback보다 우선합니다.
명시적 빈 값은 fallback을 막습니다. 공개 레코드는 참조와 가용성을 보여 주며
`connections.json`은 자격 증명이 아닌 주소만 담습니다. 검토 capability와 입력 token은
모델에 보이는 내용에 포함되면 안 됩니다. 비공개 소스·이미지·변형된 프로그램 출력에는
민감한 정보가 있을 수 있습니다. 런타임 증거는 로컬 데이터이며 자동 공개 형식이 아닙니다.

구현: [storage adapters](../app/server/src/adapters/storage),
[레코드 계약](../app/server/src/core/types/contracts.ts),
[검토 저장](../app/server/src/adapters/storage/reviews.ts),
[캡처 저장](../app/server/src/adapters/storage/captures.ts).
