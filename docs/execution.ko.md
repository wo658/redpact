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
Unit 실행은 Unit 탭 또는 `run_tests` (`kind: "unit"`)에서 시작해 설정된 전체 명령을 실행하며, 종료 상태를 Integration 케이스
결과로 취급하지 않습니다. Playwright 실행은 Playwright UI/API 또는 `run_tests` (`kind: "playwright"`)에서 선언된 기능 또는 캡처
target을 선택해 시작합니다. 스크린샷, UI Review 산출물, 실행 기록과 정리는 MCP 제출이 아닌
해당 Playwright 실행에 남습니다. 승인 제한, 기록된 증거 조회와 공개 수명주기 경계는
[MCP 인터페이스](interfaces.md)를 참고하세요.

뷰어는 세 실행 유형의 결과 화면에 같은 형식의 진행 상태를 표시합니다. 현재 준비·실행·정리·
완료 단계와 경과 시간을 보여 주며, 실행 중인 Unit과 Integration은 실행 버튼 옆에도
표시합니다. Unit은 소스 캡처, Docker 연결 확인, 컨테이너 빌드, 명령 실행을 구분합니다.
Integration은 대기열, 환경 준비, 테스트 실행을 구분하고 Playwright는 앱 환경 준비,
브라우저 시작, 브라우저 실행을 구분합니다. 단계는 각 실행에 이미 저장된 사실에서
계산하므로 갱신 사이의 짧은 단계는 건너뛸 수 있습니다. 단계별 시간 기록이나 실시간
명령 출력은 아닙니다. 오류와 정리 결과는 선택한 실행 기록에 남습니다.

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

## 수동 Container

프로젝트 Container 화면은 설정된 메인 체크아웃을 기본으로 사용합니다. MCP `project_container`는
`path`의 실제 워크트리를 사용하고 HTTP Container 경로는 `worktreeId`로 대상을 선택합니다.
디렉터리 프로젝트는 연결된 루트를 사용하며 모든 대상은 고정 공유 설정을 사용합니다.
워크트리마다 테스트 환경과 독립된 수동 환경 하나를 가질 수 있습니다. 명시적인 Stop 또는
Restart까지 테스트·유휴 시간·에이전트 완료·Redpact 종료 후에도 유지합니다. 서버 재시작은
소유권과 실제 Docker 상태에 재연결하며 서비스를 다시 만들거나 테스트 증거로 처리하지 않습니다.
중단된 준비는 실패 상태로 남고 중단된 종료는 정리 소유권을 보존하여 재시도할 수 있습니다.
Docker 접근 불가는 사용자의 명시적 종료 성공과 구분합니다.

Stop은 소유 컨테이너, 익명·전용 named 볼륨, 네트워크, 환경 빌드 태그, 소스 스냅샷,
생성된 런타임 파일을 제거합니다. 준비·서비스 로그와 과거 환경 기록은 보존합니다. 전용 이름은
환경 UUID를 사용하므로 작성된 nonexternal 네트워크·볼륨명이나 빌드 이미지 태그가 다른 워크트리와
충돌하거나 기존 프로젝트 태그를 덮어쓰지 않습니다. external 볼륨·네트워크, bind mount,
pull한 기반 이미지와 무관한 태그는 환경 소유권 밖입니다.

BuildKit의 내용 기반 내부 캐시와 공유 이미지 레이어는 공유 Docker 리소스로 남습니다.
Redpact는 이를 prune하지 않으며 태그 삭제가 표시된 이미지 크기 전체의 디스크 회수를
보장하지 않습니다. 빌드는 환경별 새 이미지 label 대신 인스턴스 소유 label을 사용하여 같은
최종 레이어를 재사용하며 생성한 Compose 파일은 빌드 컨텍스트 밖에 둡니다. 소스 변경은
공유 캐시를 늘릴 수 있지만 전용 이미지·태그·런타임 파일은 제거합니다. 프로젝트가 명시한
캐시 export는 프로젝트 관리 공유 리소스입니다. 정리 실패를 종료 완료로 표시하지 않고
소유권·진단을 보존하여 재시도하며 Restart는 성공적인 teardown을 기다립니다.

로컬 편집은 입력 변경으로 표시되지만 hot reload나 재시작을 하지 않습니다.
Restart는 기존 소유 리소스를 제거한 후 새 입력을 캡처하며 정리 실패 시 대체를 막습니다.
소스나 설정이 사라져도 Stop은 가능합니다. 입력을 되돌리면 차이가 사라지고 알 수 없는
입력은 최신 상태가 아닌 진단으로 표시합니다. Ready 전에 HTTP 엔드포인트의 호스트
접근성을 확인합니다. 어떤 HTTP 응답이든 접근성 증거이며 앱 정상 동작 판정은 아닙니다.

## Compose와 소스 캡처

Compose는 앱의 실행 정의입니다. Redpact는 설정된 서비스 선택과 명시적 의존성
환경변수 바인딩을 적용하고 소유권을 기록하며, 서비스의 네트워크 모드가 허용하면
러너 연결을 추가합니다. 별도의 관리용 Compose 부분집합을 강제하지 않습니다.
호스트 마운트, 권한, 컨테이너명, 외부 리소스, `env_file`,
configs/secrets와 고급 빌드 옵션을 Redpact 정책으로 거부하지 않습니다.
포트 공개는 메인 수동 환경 의존성의 명시적 `hostPorts`를 제외하면 호스트 자동 할당을 사용합니다.
[설정](configuration.md)을 참고하세요. 빌드 이미지 태그와 nonexternal 네트워크·볼륨명은 환경에 귀속됩니다.
직접 지정한 컨테이너명 등 호스트 리소스는 여전히 충돌할 수 있으며 네이티브 오류를 보존합니다.

Compose/Testcontainers가 네이티브 설정·빌드·시작·대기 오류를 처리합니다.
healthcheck는 선택 사항입니다. 있으면 보고된 health를 관찰하고 없으면 실행 중인
서비스를 인정합니다. Redpact는 호스트 HTTP 도달 가능 여부를 별도 시작 조건으로
검사하지 않으며, 실제 HTTP·DB 동작은 테스트 어설션으로 확인합니다. 완료 작업에는 `service_completed_successfully`를 사용합니다.
Redpact 설정 스키마, 의존성 바인딩 충돌, 입력 식별, 취소와 정리 소유권 검사는
Compose 정책과 별도로 유지합니다.

`docker compose config`는 캡처에 필요한 병합 입력과 경로 해석에 사용하며,
별도의 정책 검증기를 실행하기 위한 단계가 아닙니다. 패치된 Testcontainers API가
시간·출력 상한과 취소를 적용하고 명시된 최소 환경으로 이 명령을 실행합니다. 해석된 서비스 정의는 Compose 옵션을 보존한 채
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

Playwright는 현재 워크트리 캡처 초안과 변경된 프로젝트 캡처 파일을 실행 전이나
PNG가 없는 상태에서도 보여 줍니다. 소스가 있으면 탭, 파일 선택과 실행 버튼을
사용할 수 있습니다. Desktop·Mobile은 소스 목록이 아닌 기록된 이미지만 필터링합니다.
선택 크기에 맞는 최신 실행에 이미지가 없다고 이전 이미지를 대신 보여 주지 않습니다. 기록된 CSS viewport
너비 768px을 경계로 PNG를 분류합니다. 정보가 없으면 두 모드에 명시적으로 표시합니다.
픽셀 크기, 파일명, 현재 실행 기본값으로 viewport를 추정하지 않습니다. 프로젝트 Captures는
실행 전에도 선언된 capture 소스를 표시하고 파일별 Test Code와 Screenshots를 분리합니다. 빈
Screenshots 탭도 실행 가능한 capture 코드를 숨기지 않습니다. 프로젝트 Tests는 변경 파일
검토와 별도로 Captures·Tests·Runs를 유지합니다.

비어 있지 않은 환경변수 값이 있는 실행은 trace archive를 생략합니다. 이미지·비디오·제출 소스는 자격 증명
검사를 하지 않습니다. 환경변수 원문을 텍스트에서 가리는 것은 악성 코드 sandbox가 아닙니다.

프로젝트에서 선택한 캡처 파일은 큰 이미지 위에 이름이 표시된 썸네일을 가로로
나열합니다. 드롭다운을 열지 않고 썸네일을 클릭하거나 라디오 그룹의 방향키로
체크포인트를 선택할 수 있습니다. 좁은 화면에서는 썸네일 목록을 가로로 스크롤하며,
선택한 이미지는 모바일 콘텐츠 너비를 채우며 남은 높이에 맞춰 축소되지 않고 세로로
스크롤됩니다. 이미지 아래의 실행 기록 링크도 유지됩니다.

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

고정 버전 `testcontainers@12.1.0`과 저장소 패치가 Docker 작업을 담당합니다.
Compose 설정 해석·빌드·시작, 이미지 빌드·pull·검사·선택 삭제, 컨테이너와 네트워크
탐색, 볼륨 검사·제거, 로그, exec, 자원 제한 갱신, OOM 이벤트, 아카이브와 순서 있는
중지·제거가 포함됩니다. 프로덕션 adapter는 Docker CLI나 Dockerode를 직접 호출하지
않습니다. 런타임 클라이언트가 worker 종료나 재시작 이후 기존 ID를 조회하고 선택한
로컬 socket과 데몬 식별자를 제공합니다.

패치는 고정 버전에 부족한 API를 기존 라이브러리 클라이언트에 확장합니다. 이전 이미지
태그가 있어도 빌드 스트림 오류를 전파하고, 빌드 후 검사한 이미지 ID를 반환하며,
개별 컨테이너 대기 실패에서도 `autoCleanup: false`를 적용합니다. 유한 로그 snapshot은
조회 오류를 전파하고 TTY와 다중화된 stdout/stderr를 처리합니다. Exec는 취소와 출력
상한을 지원하며, 컨테이너 중지와 한도·판정 기록은 런타임이 담당합니다. Compose 설정
해석의 기본 제한은 30초와 4 MiB입니다.

Integration과 Playwright 러너 태그에는 번들 빌드 입력 전체의 digest가 포함됩니다.
입력 라벨이 일치해야 재사용하며 실행에는 검사한 이미지 ID를 사용합니다. 빌드 오류가
이전 태그로 대체되지 않습니다. Unit 이미지는 실행별 소유 라벨을 유지하고 cache mount 등
작성한 Dockerfile 기능을 위해 BuildKit을 활성화합니다. 공유 러너 Dockerfile은 라이브러리
기본 빌더를 사용합니다. 빌드
레이어 캐시는 활성화하고 자동 이미지 삭제는 끄므로 위의 소유권·보존 규칙을 Redpact가
적용합니다. 변경 가능한 상류 이미지와 외부 다운로드는 불변 소스 보장에 포함되지 않습니다.

Redpact는 승인, 입력·증거 식별자, 영속 상태, 자원 소유권, 보존과 정리 재시도를
담당합니다. Healthcheck가 있는 서비스는 healthy를 기다리고, 나머지 실행 중 서비스는
게시 포트를 기다리지 않습니다. HTTP/DB 준비는 테스트 assertion으로 검증해야 합니다.
시작 실패 시 증거 수집과 소유 자원 정리 전까지 컨테이너를 보존합니다. 아카이브는
Testcontainers로 가져오고 호스트 `tar`로 추출합니다.

Testcontainers 업그레이드 시 설치 패키지 번들링을 포함해 패치를 재평가하고 검증합니다.
이 확장은 저장소에서 유지하는 라이브러리 변경이며, 수정하지 않은 upstream 12.1.0이
해당 계약을 제공한다는 의미가 아닙니다.
