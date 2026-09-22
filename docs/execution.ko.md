---
title: 실행과 환경
description: 테스트 런타임, 실행 증거, 수동 컨테이너, 제한과 정리를 설명합니다.
---

# 실행과 환경

## 런타임 소유권

| 진입점 | 런타임과 입력 | 결과 |
| --- | --- | --- |
| Unit | 프로젝트 Dockerfile과 전체 설정 명령을 임시 컨테이너에서 실행 | 명령 상태, 종료 코드, stdout/stderr와 정리 상태 |
| Integration | 컨테이너 Vitest가 새 Testcontainers Compose 앱 환경을 검증 | 불변 제출 소스, 케이스, 단계와 실행·환경 레코드 |
| Playwright | 임시 앱 환경을 대상으로 컨테이너 브라우저 실행 | 기능 결과 또는 캡처 증거, 선택적 비디오·trace |
| Container | 명시적으로 시작한 수동 프로젝트 앱 환경 | 점검 엔드포인트와 수명주기 상태. 테스트 증거는 아님 |

Unit에는 호스트 명령 fallback이 없습니다. Dockerfile은 소스와 의존성을 `/workspace`에
복사하고 `/bin/sh`를 제공하며 빌드 중 설치해야 합니다. `cwd`는 명령 디렉터리를
선택합니다. Dockerfile ENTRYPOINT/CMD가 Redpact supervisor를 제공하지 않습니다.
선택된 소스 파일은 실행 명령을 필터링하지 않으며 종료 코드로 개별 케이스 판정을 만들지 않습니다.

프로젝트 Tests의 Integration은 현재 전체 프로젝트 목록을, 워크트리 검토에서는
가장 최근 제출 묶음을 실행합니다. MCP `run_tests`는 주어진 경로의 새 소스를 수집합니다.
제출 식별자와 현재 파일을 뷰어에서 구분해야 합니다. 수집 및 단언 규칙은
[테스트 작성](tests.md)을 참고하세요.

세 항목은 서로 다른 실행 계약입니다. MCP `run_tests`는 Integration 제출만 실행합니다.
Unit 실행은 Unit 탭에서 시작해 설정된 전체 명령을 실행하며, 종료 상태를 Integration 케이스
결과로 취급하지 않습니다. Playwright 실행은 Playwright UI/API에서 선언된 기능 또는 캡처
target을 선택해 시작합니다. 스크린샷, UI Review 산출물, 실행 기록과 정리는 MCP 제출이 아닌
해당 Playwright 실행에 남습니다.

에이전트가 수행하는 검증에서 직접 Docker/Compose, Vitest 또는 Playwright CLI를 실행한
결과는 Redpact 실행 증거가 아닌 로컬 진단입니다. 연결된 워크트리에 결과와 정리가 남도록
선택한 각 경로는 위의 진입점으로 시작해야 합니다.

## 임시 수명주기

실행은 앱 준비 전에 대기열에 들어가며 환경 연결은 나중에 나타날 수 있습니다.
실행마다 새 환경을 소유하며 다른 실행의 완료된 환경을 예약할 수 없습니다.
공개 독립 준비와 `environmentId` 재사용 입력은 지원하지 않습니다. 환경은 준비,
준비 완료, 사용, 완료, 제거로 진행하고 실패 진단을 보존합니다.

성공, 어설션 실패, 준비 실패, 취소, 중단 모두 정리를 요청합니다. Stop은 수락을 막고
실행 취소를 확인한 다음 소유한 컨테이너·네트워크·볼륨·실행별 Unit 이미지·임시 Compose 빌드 이미지·캡처 런타임 소스를 제거합니다.
Integration과 Playwright는 공유 러너 이미지를 유지하고, 임시 앱 이미지는 실행 환경에 속해 환경과 함께 제거합니다.
메타데이터, 로그, 결과와 공유 Docker 빌드 캐시는 보존합니다. 정리 실패인 `stop_failed`는
테스트 판정과 다르며 재시도할 수 있습니다. 시작 시 label로 리소스를 대조하고 중단된
환경을 제거하며 테스트를 자동 재실행하지 않습니다.

임시 Compose 환경을 시작하기 전에 선택된 모든 빌드 서비스에 환경 소유 이미지 태그를
부여합니다. `build`와 `image`를 함께 선언한 서비스도 포함하며 추가 빌드 태그는 덮어씁니다.
이 임시 태그를 이미지 정리용 manifest에 캡처하므로 원본 Compose 파일, 비활성 서비스,
필수 환경변수 표현식을 다시 평가하지 않고 정리합니다. 기존 프로젝트 이미지 태그와
이미지 전용 의존성은 보존하며 애플리케이션 자격증명을 다시 제공할 필요가 없습니다.
Unit 빌드 이미지에는 소유자·실행 label을 붙여 이미지 ID 기록 전 컨테이너 시작이
실패해도 정리할 수 있습니다.

Playwright는 Dockerfile과 번들 reporter 파일의 digest가 같으면 공유 브라우저 이미지를
재사용하며 다음 캡처에서 브라우저 이미지 빌드를 생략합니다. 각 캡처는 여전히 새 브라우저
컨테이너와 새 앱 환경을 시작하고 실행 후 컨테이너와 앱 볼륨을 제거합니다. 러너 이미지
업그레이드와 Docker 빌드 캐시는 실행별 정리와 별개입니다. 앱 이미지 크기는 프로젝트
Dockerfile에 따라 달라지므로 빌드·실행 단계를 분리해 실행 레이어에 빌드 도구와 캐시가
남지 않도록 하세요. 이 저장소의 `e2e/Dockerfile`은 빌드 단계를 분리하고 기존 런타임
패키저를 사용합니다. 프로덕션 서버 의존성, 빌드된 UI, 편집 가능한 Git fixture는 유지하며
웹 개발 의존성과 빌드 단계의 패키지 저장소는 실행 이미지에서 제외합니다.

Redpact는 관계없는 Docker 리소스를 prune하지 않습니다. Shared-local과 remote 서비스는
독립 관리되며 Redpact가 중지하지 않습니다. 테스트가 fixture 격리를 소유합니다.
정상 종료는 실행과 정리를 기다리며 갑작스러운 종료는 복구 전까지 리소스를 남길 수 있습니다.

## 수동 Container

프로젝트 Container는 설정된 메인 브랜치의 실제 체크아웃과 미커밋 입력을 사용합니다.
디렉터리 프로젝트는 연결된 루트를 사용합니다. 필요한 체크아웃이 없으면 다른 것으로
대체하지 않습니다. 프로젝트의 고정 실행 설정을 사용하며 프로젝트당 하나가
Stop·Restart·서버 종료까지 유지됩니다. `lifecycle: "manual"`이고 테스트 실행 ID가
없으며 테스트 실행에서 재사용할 수 없습니다.

수동 Container의 Compose 빌드 이미지는 안정적인 프로젝트별 Compose 이름을 사용하므로,
가장 최신으로 태그된 프로젝트 이미지는 수동 세션 사이에 유지됩니다. 임시 테스트 환경은
별도의 소유 빌드 태그를 사용하고 실행 후 제거합니다. 기존 프로젝트 이미지 태그와 관계없는
Docker 이미지는 보존합니다. 수동 재시작에서 교체된 이미지는 다른 태그나 컨테이너가
참조하지 않을 때만 제거합니다.

로컬 편집은 입력 변경으로 표시되지만 hot reload나 재시작을 하지 않습니다.
Restart는 기존 소유 리소스를 제거한 후 새 입력을 캡처하며 정리 실패 시 대체를 막습니다.
소스나 설정이 사라져도 Stop은 가능합니다. 입력을 되돌리면 차이가 사라지고 알 수 없는
입력은 최신 상태가 아닌 진단으로 표시합니다. Ready 전에 HTTP 엔드포인트의 호스트
접근성을 확인합니다. 어떤 HTTP 응답이든 접근성 증거이며 앱 정상 동작 판정은 아닙니다.

## Compose와 소스 캡처

Compose가 이미지, 명령, 내부 포트, 네트워크, healthcheck, 고정 선행 의존성을 정의합니다.
Redpact는 서비스 집합을 선택하고 의존성 바인딩, 소유권, 동적 호스트 loopback 포트를
적용한 후 준비 상태를 관찰합니다. 장기 실행 서비스에는 healthcheck가 필요하고
완료 작업에는 적절한 `service_completed_successfully` 의존성을 사용합니다.
프로비저닝 전에 검증하세요.

관리되는 Compose 부분집합은 host network/PID/IPC, privileged 장치, 고정 컨테이너명과
호스트 포트, 외부 리소스, 호스트 bind mount, `env_file`, 파일 secrets/configs,
include/extends, hook과 원격 빌드 입력을 거부합니다. 명시된 Compose 파일 여러 개는
지원하지만 profile 선택은 없습니다. 로컬 Unix Docker socket과 `!override`를 지원하는
Compose(v2.24.4+)를 사용하세요.

Compose 캡처는 선택된 로컬 build context와 Dockerfile별 우선순위를 포함한 Docker
ignore 규칙을 따릅니다. 이미지 전용 서비스는 소스를 스캔하지 않습니다. 경로·내용·mode·
링크 텍스트가 식별자에 포함되며 symlink를 따라가지 않습니다. Unit은 Docker 빌드 전
`node_modules`, `.pnpm-store`, `.venv`, `venv` 등 호스트 의존성 디렉터리를 제외하며,
제외된 디렉터리의 링크를 따라가거나 복사하지 않습니다. 입력 캡처에는 고정 파일 개수·전체 용량 상한이
없으며 제출 테스트 제한은 별개입니다. 동시 편집, 외부 다운로드, 변경 가능한 이미지
태그까지 완전히 불변인 앱 snapshot은 아닙니다. 대기 중 입력 변경은 준비를 무효화할 수 있습니다.

고정된 Testcontainers patch는 시작 실패 시 자동 정리가 Redpact의 최종 로그와 순서 있는
제거를 건너뛰지 않도록 합니다. 라이브러리를 갱신할 때 다시 평가해야 합니다.

## 러너 연결

실행마다 소유권 레이블이 있는 러너 네트워크를 만들고 Integration과 Playwright는
각자 별도의 네트워크 네임스페이스로 연결합니다. 관리 서비스의 DNS 별칭은
`<service>.redpact.test`이며 브라우저 baseURL은 이 이름과 설정된 scheme·port를
사용합니다. 앱은 이 origin을 허용하고 자체 CORS·쿠키·TLS를 구성해야 합니다.
Redpact는 인증서 검사나 브라우저 보안을 끄거나 원격 origin을 변경하지 않습니다.
호스트 요청의 성공만으로 러너에서 접근 가능하다고 판단하지 않습니다.

공유 호스트 URL은 `host.docker.internal`로 명시합니다. 러너는 host-gateway 매핑을
제공합니다. 실제 러너에서 Docker Desktop의 loopback 접근을 검증합니다. Linux의
host-gateway만으로 loopback 전용 리스너에 접근할 수는 없습니다. 접근 가능한 호스트
리스너나 프로젝트가 명시적으로 관리하는 전달 서비스를 구성하고 소비하는 러너에서
검증하세요. 러너 URL을 무조건 localhost로 바꾸지 마세요. 원격 서비스는 실제 URL과
인증을 유지합니다. 실행별 Docker 네트워크가 공유·원격 데이터를 격리하지 않으므로
fixture에서 독립적인 데이터를 사용해야 합니다.

## Playwright 증거

타깃은 유지 범위 `scope: "worktree" | "project"`와 목적
`purpose: "capture" | "functional"`을 선언합니다. 선택한 체크아웃을 한 번 실행하며,
과거 Before/After baseline 설명은 현재 실행 모델이 아닙니다. Capture는 시각적 증거이고
기능 단언은 검증된 동작을 입증합니다.

Playwright는 현재 워크트리 캡처 초안과 변경된 프로젝트 캡처 파일을 실행 전이나
PNG가 없는 상태에서도 보여 줍니다. 소스가 있으면 탭, 파일 선택과 실행 버튼을
사용할 수 있습니다. Desktop·Mobile은 소스 목록이 아닌 기록된 이미지만 필터링합니다.
선택 크기에 맞는 최신 실행에 이미지가 없다고 이전 이미지를 대신 보여 주지 않습니다. 기록된 CSS viewport
너비 768px을 경계로 PNG를 분류합니다. 정보가 없으면 두 모드에 명시적으로 표시합니다.
픽셀 크기, 파일명, 현재 실행 기본값으로 viewport를 추정하지 않습니다. 프로젝트 Captures는
실행 전에도 선언된 capture 소스를 표시하고 파일별 Test Code와 Screenshots를 분리합니다. 빈
Screenshots 탭도 실행 가능한 capture 코드를 숨기지 않습니다. 프로젝트 Tests는 변경 파일
검토와 별도로 Captures·Tests·Runs를 유지합니다.

비밀값이 있는 실행은 trace archive를 생략합니다. 이미지·비디오·제출 소스는 자격 증명
검사를 하지 않습니다. 알려진 비밀값을 텍스트에서 가리는 것은 악성 코드 sandbox가 아닙니다.

## 제한과 판정

인스턴스 기본값은 `environmentConcurrency: 2`, `testResources.memoryMiB: 2048`,
`testResources.timeoutSeconds: 600`입니다. 범위는 동시 관리 환경 1–4개, 메모리
64–1048576 MiB, 시간 1–86400초입니다. 새 작업은 새 설정을 캡처하며 테스트·hook별
timeout은 별개입니다.

Unit, Integration, Playwright는 Docker 메모리·swap 제한과 외부 실행 시간 제한을
사용합니다. Integration은 V8 heap도 제한합니다. 제출한 패키지 설치는 러너 안에서
같은 실행 예산을 사용합니다. 제한 초과는 실행 오류이며 어설션이나 사용자 취소가
아닙니다. 앱·의존성 컨테이너, 이미지 빌드, 직접 shell 테스트는 이 예산 밖입니다.

어설션 통과·실패와 수집·설정·환경·실행 오류, 취소·중단·미확인을 구분하세요.
파싱은 실행이 아니고, 강제 종료 후 보고서가 없다고 성공이 아닙니다. 완료된 실행도
정리가 남아 있을 수 있습니다.

## 이식 가능한 fixture

`REDPACT_CONNECTIONS_FILE`은 실행별 비공개 JSON 파일을 가리킵니다. `version: 1`과
`services.<name>.ports.<containerPort>: { host, port }`가 들어 있습니다.
호스트는 `<service>.redpact.test` 별칭, 포트는 컨테이너 내부 포트입니다. 포트를 공개하지
않은 선택 서비스는 빈 맵이며 자격 증명이나 컨테이너 변수는 없습니다. 프로젝트 fixture가
HTTP/DB 클라이언트와 정리를 소유합니다. Redpact SDK나 런타임 API 호출은 필요 없으며
Integration과 Playwright는 `tests.env`를 공유하고 서비스 URL을 내부 DNS와 포트로 해석합니다.

추가 driver는 지원되는 루트 manifest와 고정 pnpm lockfile을 helper와 함께 제출합니다.
[Order Desk provider](../examples/order-desk/tests/connections.js)와
[fixture](../examples/order-desk/tests/fixtures.js)를 참고하세요. 외부 실행에서는 예제의
`TEST_CONNECTIONS_FILE`을 사용할 수 있지만 Redpact 내부의 호스트 앱 fallback은 아닙니다.

구현: [실행 workflow](../app/server/src/workflows/execute-tests.ts),
[종료 workflow](../app/server/src/workflows/stop-environment.ts),
[Unit workflow](../app/server/src/workflows/unit-tests.ts),
[Playwright record workflow](../app/server/src/workflows/playwright.ts),
[리소스 스키마](../app/server/src/core/test-resource-schema.ts).
