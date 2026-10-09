---
title: 실행과 환경
description: 테스트 런타임, 실행 증거, 제한과 정리를 설명합니다.
---

# 실행과 환경

## 런타임 소유권

| 진입점 | 런타임과 입력 | 결과 |
| --- | --- | --- |
| Unit | 프로젝트 Dockerfile과 전체 설정 명령을 임시 컨테이너에서 실행 | 명령 상태, 종료 코드, stdout/stderr와 정리 상태 |
| Integration | 컨테이너 Vitest가 새 Testcontainers Compose 앱 환경을 검증 | 불변 제출 소스, 케이스, 단계와 실행·환경 레코드 |
| Playwright | 임시 앱 환경을 대상으로 컨테이너 브라우저 실행 | 기능 결과 또는 캡처 증거, 선택적 비디오·trace |

Unit에는 호스트 명령 fallback이 없습니다. Dockerfile은 소스와 의존성을 `/workspace`에
복사하고 `/bin/sh`를 제공하며 빌드 중 설치해야 합니다. `cwd`는 명령 디렉터리를
선택합니다. Dockerfile ENTRYPOINT/CMD가 Redpact supervisor를 제공하지 않습니다.
선택된 소스 파일은 실행 명령을 필터링하지 않으며 종료 코드로 개별 케이스 판정을 만들지 않습니다.

MCP `run_tests`는 명시한 체크아웃의 새 Integration 소스를 캡처합니다.
`run_unit_tests`는 설정된 Unit 전체 명령을, `run_playwright`는 선언된 기능·캡처 대상
하나를 실행합니다. 뷰어는 기록 조회와 사람의 승인·취소를 제공하며 테스트 실행
카탈로그는 없습니다. 제출 식별과 현재 파일을 구분합니다. 소스 수집·단언은
[테스트 작성](tests.md), 요청 승인은 [인터페이스](interfaces.md)를 봅니다.

기록된 진행 상태는 준비·실행·정리·종료를 구분합니다. Unit은 소스 캡처·Docker 연결·
이미지 빌드·명령 실행, Integration은 대기열·환경 준비, Playwright는 앱 준비·브라우저
시작을 포함합니다. 짧은 단계는 갱신 사이에 지나갈 수 있습니다. 영속 사실을 표시하며
실시간 명령 출력 스트림이나 추측한 사례별 시간이 아닙니다.

에이전트가 수행하는 검증에서 직접 Docker/Compose, Vitest 또는 Playwright CLI를 실행한
결과는 Redpact 실행 증거가 아닌 로컬 진단입니다. 연결된 워크트리에 결과와 정리가 남도록
선택한 각 경로는 위의 진입점으로 시작해야 합니다.

## 승인과 수락된 입력

Ask 정책의 MCP 실행은 프로젝트 코드를 시작하기 전에 영속 검토를 만듭니다. Unit은 전체
설정 명령과 컨테이너가 복사할 입력의 digest를 기록합니다. Playwright는 대상·목적·실제
viewport·설정 digest·앱 fingerprint·테스트 디렉터리 digest를 기록합니다. 이후 기본값이
바뀌어도 요청은 캡처한 정책을 유지합니다. 같은 요청을 채팅 App 또는 연결된 검토 화면에서
승인할 수 있습니다. [요청 승인](interfaces.md)을 참고하세요.

승인은 기록된 실행 명세와 digest를 다시 검증합니다. 설정이나 소스가 바뀌면 새 요청이
필요합니다. Unit은 Docker 연결이나 이미지 빌드 전에 실제 복사한 입력을 확인합니다.
Playwright는 수락 시 캡처한 테스트 디렉터리를, 환경 기록 전에 승인된 앱 fingerprint를
확인하고 adapter가 자원 준비 전에 복사한 입력을 다시 확인합니다. 실패는 새 입력으로
몰래 대체하지 않고 기록합니다. 대기 중 검토는 실행된 테스트·기록된 TDD red·구현에 대한
사람의 수락이 아닙니다.

Fingerprint는 아래에 설명한 입력을 다루며 모든 외부 효과를 포함하지 않습니다. 변경 가능한
이미지 태그·외부 빌드 context·호스트 mount·파일 기반 리소스·원격 서비스는 기존 Compose
경계를 유지합니다. 승인만으로 이 입력들이 불변 snapshot이 되거나 런타임 준비가 입증되지는
않습니다.

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

`image`를 명시하지 않은 임시 Compose 빌드는 Compose의 프로젝트별 이미지 태그와
소유자·환경 label을 사용합니다. 정리는 그 소유 태그만 기록하고 제거합니다.
명시한 `image`, `build.tags`, pull 정책과 빌드 옵션은 변경하지 않으며, 해당 태그와
외부 네트워크·볼륨은 정리 대상이 아닙니다. 이름 있는 리소스는 label이 이번 환경의
소유권을 나타낼 때만 제거합니다. 익명 볼륨은 소유 컨테이너와 함께 제거합니다.
앱이 마운트했다는 이유만으로 볼륨을 소유한 것으로 간주하지 않으며,
정리할 때 Compose 표현식을 다시 평가하지 않습니다.
Unit 빌드 이미지에는 소유자·실행 label을 붙여 이미지 ID 기록 전 컨테이너 시작이
실패해도 정리할 수 있습니다.

공유 Playwright 러너에는 Chromium과 필요한 시스템 의존성만 설치하며 Firefox와
WebKit은 포함하지 않습니다. 자체 E2E 앱은 브라우저 없는 Node slim 런타임을 사용합니다.
테스트 코드 diff와 캡처 크기 필터 검증을 포함한 브라우저 시나리오는
`ui-tests/project/tests`에 두고 별도 Playwright 러너에서 실행합니다.

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

과거 수동 환경은 일반 환경 정리로 계속 읽고 제거할 수 있습니다. 새 수동 프로젝트
환경을 시작하거나 재시작할 수는 없습니다. 관리 기능을 제거해도 기록과 소유 자원을
정리 없이 삭제하지 않습니다. 별도로 요청된 개발 서버는 호스트 에이전트가 담당합니다.

## Compose와 소스 캡처

Compose는 앱의 실행 정의입니다. Redpact는 설정된 서비스 선택과 명시적 의존성
환경변수 바인딩을 적용하고 소유권을 기록하며, 서비스의 네트워크 모드가 허용하면
러너 연결을 추가합니다. 별도의 관리용 Compose 부분집합을 강제하지 않습니다.
고정 호스트 포트, 호스트 마운트, 권한, 컨테이너명, 외부 리소스, `env_file`,
configs/secrets와 고급 빌드 옵션을 Redpact 정책으로 거부하지 않습니다.
작성된 포트 공개와 이미지 태그를 보존합니다. 고정 포트나 이름을 의도적으로
사용하면 동시 실행이 충돌할 수 있으며, 해당 네이티브 오류를 보존합니다.

Compose/Testcontainers가 네이티브 설정·빌드·시작·대기 오류를 처리합니다.
healthcheck는 선택 사항입니다. 있으면 보고된 health를 관찰하고 없으면 실행 중인
서비스를 인정합니다. Redpact는 호스트 HTTP 도달 가능 여부를 별도 시작 조건으로
검사하지 않으며, 실제 HTTP·DB 동작은 테스트 어설션으로 확인합니다. 완료 작업에는 `service_completed_successfully`를 사용합니다.
Redpact 설정 스키마, 의존성 바인딩 충돌, 입력 식별, 취소와 정리 소유권 검사는
Compose 정책과 별도로 유지합니다.

`docker compose config`는 캡처에 필요한 병합 입력과 경로 해석에 사용하며,
별도의 정책 검증기를 실행하기 위한 단계가 아닙니다. Testcontainers 12.1.0에는
공개 유효 모델 API가 없습니다. 해석된 서비스 정의는 Compose 옵션을 보존한 채
Testcontainers에 전달됩니다. 서버는 최소 프로세스 환경과 명시적으로 제공된
바인딩만 전달하며 임의의 서버 자격증명을 전달하지 않습니다. 프로젝트 `.env`와
`env_file`은 Compose가 해석합니다. 로컬 Unix Docker socket과 프로젝트가 선언한
구문을 지원하는 Compose 버전을 사용하세요.

캡처는 선택된 프로젝트 내부 build context에 Docker ignore 우선순위를 적용해
복사합니다. 외부·원격·링크된 빌드 입력은 작성된 위치를 유지하고 Compose/BuildKit이
처리하며, Redpact는 내용을 읽거나 복사하지 않습니다. 호스트 마운트와 파일 기반
리소스도 외부 런타임 입력으로 유지합니다. 이 입력은 불변 앱 snapshot에 포함되지
않습니다. 이미지 전용 서비스는 소스를 스캔하지 않습니다. 캡처한 파일의 경로·내용·
mode·링크 텍스트가 식별자에 포함됩니다. Unit은 Docker 빌드 전
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

뷰어는 기록된 실행 하나와 캡처된 소스·산출물을 엽니다. PNG가 없으면 명시하며
다른 실행의 이미지를 대체하지 않습니다. 각 PNG의 viewport는 기록된 CSS viewport
정보로 설명합니다. 픽셀·파일명·현재 기본값으로 viewport나 소스 최신성을 추론하지
않습니다. 보이는 파일로 검증 범위를 추측하지 말고 선택한 전체 대상의 결과를 읽으세요.

비어 있지 않은 환경변수가 있는 실행은 trace archive를 생략합니다. 이미지·영상·제출
소스의 인증 정보를 검사하지 않습니다. 텍스트 원문 마스킹은 악성 코드 sandbox가 아닙니다.

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
Integration과 Playwright는 `tests.env`를 공유하고 작성한 문자열 값을 그대로 사용합니다.

추가 driver는 지원되는 루트 manifest와 고정 pnpm lockfile을 helper와 함께 제출합니다.
[Order Desk provider](../examples/order-desk/tests/connections.js)와
[fixture](../examples/order-desk/tests/fixtures.js)를 참고하세요. 외부 실행에서는 예제의
`TEST_CONNECTIONS_FILE`을 사용할 수 있지만 Redpact 내부의 호스트 앱 fallback은 아닙니다.

구현: [실행 workflow](../app/server/src/workflows/execute-tests.ts),
[종료 workflow](../app/server/src/workflows/stop-environment.ts),
[Unit workflow](../app/server/src/workflows/unit-tests.ts),
[Playwright record workflow](../app/server/src/workflows/playwright.ts),
[리소스 스키마](../app/server/src/core/test-resource-schema.ts).

## Testcontainers 위임

고정 버전 `testcontainers@12.1.0`이 Compose 시작, 이미지 빌드·pull,
컨테이너 핸들, 매핑 포트 조회, 컨테이너 검사, 일반 exec, 아카이브 조회,
중지·제거와 네트워크 제거를 담당합니다. 공개 런타임 클라이언트는 워커 종료나
서버 재시작 뒤에도 기존 컨테이너 ID를 조회합니다. 복구 과정에서 실행 중인
Compose 환경 핸들을 재구성하지 않습니다. 모든 런타임 접근은 Testcontainers가
선택한 로컬 소켓을 사용합니다. 러너 네트워크 ID는 생성한 이름을 그대로 넘기지
않고 런타임에서 조회합니다.

Redpact는 실행 수락, 취소, 영속 식별 정보, 리소스 소유권, 이미지 보존,
증거와 정리 재시도를 계속 담당합니다. 고정 버전의 공개 Testcontainers API가
지원하지 않는 다음 작업은 해당 클라이언트가 노출하는 Docker 연결로 처리합니다.

- 중지된 컨테이너와 소유 네트워크·볼륨 목록, 데몬 식별 정보와 한도 조회.
- 선택적 이미지 삭제와 볼륨 검사·제거. 이미지 검사는 Testcontainers를 사용하며,
  삭제 시 공유 이미지나 Docker 빌드 캐시를 일괄 정리하지 않습니다.
- 종료 로그 스냅샷: 이 버전의 `ContainerClient.logs`는 항상 스트림을 계속
  구독하고 조회 오류를 숨깁니다. 정리는 오류와 종료 출력을 보존해야 합니다.
- 출력 상한을 둔 스트리밍 exec, 메모리·swap 설정과 과거 OOM 조회.
  일반 `exec`는 전체 출력을 버퍼링하며 취소·출력 상한 계약이 없습니다.

Compose 입력 해석은 위 캡처 계약을 위해 `docker compose config`를 사용합니다.
공개 런타임 클라이언트가 유효 모델 API를 제공하지 않기 때문입니다. 러너 출력의
아카이브는 Testcontainers로 조회하고 호스트 `tar` 명령으로 추출합니다.
Testcontainers 업그레이드 시 이러한 예외와 시작 실패 패치를 재평가합니다.
이미지 삭제, 로그 스냅샷, 출력 상한을 둔 실행을 라이브러리 전용 API에 완전히
위임한 것으로 간주하지 않습니다.
