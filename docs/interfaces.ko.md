---
title: HTTP와 MCP 인터페이스
description: 공유 서비스, 요청 승인과 로컬 접근 경계를 설명합니다.
---

# HTTP와 MCP 인터페이스

## HTTP 레퍼런스

실행 중인 서버는 `/openapi.json`, `/docs`(Swagger UI), `/swagger`, `/redoc`을 제공합니다.
Hono 라우트 메타데이터와 공유 validator가 API 스키마를 생성합니다. 필드별 정본은
이 생성 레퍼런스이므로 전체 HTTP 스키마를 Markdown에 복사하지 않습니다. 에셋은
로컬 번들입니다. 이 API 문서 라우트는 공개 Next.js 문서 사이트와 별개입니다.

HTTP와 MCP는 같은 애플리케이션 workflow로 진입하고 실행·설정 검증을 공유합니다. 읽기 전용 검사는
코드를 실행하지 않습니다. 명시적 변경 라우트는 뷰어 밖에서 호출해도 해당 사전조건을
검사합니다. [아키텍처](architecture.md)를 참고하세요.

## 에이전트 CLI

`redpact`는 Redpact가 소유한 상태·설정·관리형 실행·기록된 증거를 다루는 에이전트
인터페이스입니다. 로컬 HTTP로 실행 중인 서버의 공통 workflow를 호출하며 명령마다 별도
저장 writer나 실행 엔진을 시작하지 않습니다. 모델용 MCP는 수명 주기와 앱 열기로 제한하며 기존 작업 도구는 App 전용으로 유지합니다.
일반 파일 탐색과 Git 작업은 제외하며 기존 파일 도구와 네이티브 `git`/`gh`를 사용합니다.

연결된 인스턴스는 `--server http://127.0.0.1:54321` 또는 `REDPACT_SERVER_URL`로
지정합니다. 둘 다 없으면 독립 실행 기본값 `http://127.0.0.1:54318`을 사용합니다.
App Page 인스턴스는 일반적으로 54322를 사용합니다. CLI는 다른 포트를 탐색하지 않습니다.
`--path`는 현재 디렉터리를 기준으로 해석하며 생략하면 현재 디렉터리를 사용합니다.
자동화에서는 절대 체크아웃 경로를 쓰세요. GUI에서 선택한 프로젝트는 영향을 주지 않습니다.
조회만으로 프로젝트를 자동 연결하지 않습니다. 기록 명령은 현재 디렉터리와 무관하게 저장된
`--kind`와 `--id`로 대상을 지정합니다.

| 명령 | 용도 |
| --- | --- |
| `runtime status/start/stop`, 기존 `serve` | 로컬 런타임 조회·시작·종료 또는 foreground/supervised 서버 실행 |
| `projects list/connect/show/rename/disconnect/reconnect` | Redpact 프로젝트 연결 관리. 기록 변경은 `--project ID` 사용 |
| `workspace status --path PATH`, `workspace list --project ID` | 체크아웃 식별·진단·승인·실행과 관찰된 체크아웃 확인 |
| `settings describe/get/patch/validate/repair --scope project\|instance` | [revision 기반 계약](settings-reference.md)으로 설정 조회·수정 |
| `dependencies inspect --path PATH` | 고정 의존성 구성 확인 |
| `environment inspect/start/restart/stop --path PATH` | 선택한 체크아웃의 수동 환경 관리 |
| `environments list --path PATH`, `show/stop --id ID` | 기록된 자원 확인. 수동 소유 자원만 종료 |
| `tests list --kind KIND --path PATH`, `tests targets --path PATH` | 현재 테스트와 선언된 Playwright 대상 탐색 |
| `tests run --kind KIND --path PATH` | 승인 경계를 거쳐 캡처된 입력 제출 |
| `submissions list --path PATH`, `show/run --id ID` | 보존된 Integration 제출 조회·재실행 |
| `runs list --path PATH`, `show/context/wait/logs/source/artifacts/artifact --kind KIND --id ID` | 기록된 결과와 증거 확인 |
| `updates status/check/install --version VERSION` | 런타임 업데이트 상태·새 버전 확인과 명시적 설치 |
| `plugins status/check/install --agent codex\|claude --version VERSION` | 에이전트 플러그인 업데이트 상태·새 버전 확인과 명시적 설치 |
| `open`, `open --path PATH` 또는 `open --kind KIND --id ID` | 같은 인스턴스의 전체 앱·체크아웃 이력 또는 정확한 기록 검토 열기 |

명령별 옵션은 `--help`로 확인하세요. 업데이트 명령의 `--version`은 `install`에서만,
`--agent`는 플러그인 설치에서만 필수입니다. `projects list --state connected|disconnected|all`의
기본값은 connected입니다. 카탈로그의 `tests list --scope all|changed`는 Unit/Integration에만
적용되고 기존 서버 카탈로그 기본값을 유지하며 실행 범위를 선택하지 않습니다.
`tests run --execution-scope all|changed`는 공통 실행 기본값을 재정의합니다.
`--kind`는 `unit`, `integration`, `playwright`입니다. Integration만 반복된
`--test RELATIVE_PATH`를 허용합니다. Playwright는 `--target NAME`이 필수이며
`--viewport WIDTHxHEIGHT`을 선택할 수 있습니다. 크기는 예를 들어 `1280x720`이며 너비 320–3840, 높이 240–2160을 허용합니다.
종류에 맞지 않는 옵션은 무시하지 않고 거부합니다.

`runs source`는 현재 작업 파일이 아닌 캡처된 `--file CAPTURED_PATH`가 필수입니다.
`runs logs`는 제한된 출력과 잘림 정보를 반환합니다. `runs artifacts`는 메타데이터를,
`runs artifact --artifact ID --output FILE [--side before|after]`는 해당 Playwright
실행 소유 아티팩트를 지정한 새 파일에 저장합니다. 기존 파일은 덮어쓰지 않습니다. `runs list`, `submissions list`,
`runs artifacts`는 반환된 `--before` 커서를 받습니다. 페이지 간 대상과 필터를 유지하세요.
기존 서버의 소유권과 크기 제한을 그대로 적용합니다.

`--json`은 stdout에 버전이 있는 문서 하나를 출력합니다.
`{ "version": 1, "ok": true, "data": ... }` 또는
`{ "version": 1, "ok": false, "error": { "code": ..., "message": ... } }`이며
오류에 구조화된 상세가 포함될 수 있습니다. 대화형 입력은 요구하지 않습니다.
`--json`이 없어도 성공 결과는 같은 envelope를 읽기 쉽게 출력합니다.

`--wait` 없는 제출은 접수 상태와 식별자를 반환하며 종료 코드 0이 테스트 통과를 뜻하지
않습니다. `tests run`, `submissions run`, `runs wait`는 `--wait-timeout SECONDS`를
지원하고 기본값은 600초입니다. 최종 결과·사람의 승인 필요·클라이언트 제한 시간에 대기가
끝납니다. 시간 초과나 클라이언트 중단은 서버 실행을 취소하지 않습니다. 승인 필요 상태는
즉시 반환하며 검토 URL을 열어 사람이 조작해야 합니다. CLI는 요청 승인이나 승인 정책
변경을 수행할 수 없습니다.

| 종료 코드 | 의미 |
| --- | --- |
| `0` | 비동기 제출 접수를 포함해 요청 작업 성공 |
| `1` | 전송 또는 서버 작업 실패 |
| `2` | 잘못된 명령·입력·설정 또는 없는 기록 |
| `3` | 대기 중 실행 실패 관찰 |
| `4` | 대기 중 사람의 승인 필요 |
| `5` | 클라이언트 대기 시간 초과 |
| `6` | revision 또는 실행 허용 조건 충돌 |
| `7` | 대기 중 확인이 필요한 자원 정리 실패 관찰 |

정리 실패가 실행 실패보다 우선하며 두 사실은 결과에 함께 남습니다. 실패한 과거 실행도
`runs show`로 조회에 성공하면 종료 코드는 0입니다. 공개 테스트 취소·테스트 환경 강제
종료·증거 삭제는 추가하지 않습니다.

## 모델용 MCP와 App 전용 전송

런타임 HTTP MCP는 `redpact_status`, `stop_redpact_server`, `open_redpact`만 모델에
노출합니다. `open_redpact`는 같은 인스턴스의 뷰어 URL을 반환하며 테스트를 실행하지 않습니다.
중지된 프로세스는 HTTP 요청을 받을 수 없으므로 HTTP MCP로 시작할 수 없습니다.
App Page companion은 자신이 소유한 런타임의 `get_redpact_status`,
`start_redpact_runtime`, `stop_redpact_runtime`과 기존 `open_redpact_app`을 제공합니다.
수명 주기 모델 도구는 App 전용 capability token을 요구하거나 반환하지 않습니다.

아래 작업 도구는 기존 App/카드 통신을 위해 App 전용 visibility로 유지합니다.
에이전트 작업은 위 CLI를 사용하며 숨겨진 도구를 호출하지 않습니다. 원시 `tools/list`에
App 전용 도구가 포함될 수 있으며 호스트가 visibility 메타데이터에 따라 모델 목록에서
제외해야 합니다. App 전용 도구의 존재는 모델 호출이나 사람의 승인 대행을 허용하지 않습니다.


| 도구 | 계약 |
| --- | --- |
| `get_workspace_status` | 절대 체크아웃 `path`; 읽기 전용 설정 진단, 기존 연결, 승인 대기, 활성·최근 실행과 정리 문제 |
| `get_review_context` | 실행 `kind`와 `id`; 제한된 실패 정보, 기록된 근거 참조, 캡처된 승인 미리보기와 상대 뷰어 검토 경로 |
| `configure` | 절대 실행 `path`의 `describe`, `inspect`, `validate`. 스키마, 루트, 진단과 선택적 계획 반환 |
| `run_tests` | 절대 `path`, `kind: integration / unit / playwright`; Integration은 선택적 `tests`, Unit은 명령/파일 명령 계약, Playwright는 필수 `target`과 선택적 `viewport` 사용; 모두 선택적 `executionScope` 지원 |
| `get_run` | `kind`, `id`, 선택적 `detail: result / log / source / image`로 상태·기록된 증거·정리 조회 |
| `list_runs` | 체크아웃 절대 `path`, 선택적 `kind`와 반환 커서 `before`; 종류에 맞는 실행을 페이지당 최대 20개 조회 |
| `get_run_artifact` | Playwright `id`, `artifactId`, 선택적 `side`; 해당 실행 소유 PNG·영상·trace를 최대 8 MiB까지 조회 |
| `project_container` | 관찰된 프로젝트 체크아웃의 절대 `path`, `action: inspect / start / restart / stop`; 선택한 워크트리의 지속 수동 환경 수명주기 |

`run_tests`는 엄격한 discriminated union으로 종류별 입력을 검증합니다. Unit은 파일
임의 요청별 명령을 거부하고 Playwright는 임의 케이스 선택을 거부합니다. 모든 종류는 `executionScope: all | changed`에 공통 [선택 계약](execution.md)을 적용합니다. 모든 종류는
HTTP와 같은 워크플로, 고정 프로젝트 설정과 기존 입력 캡처를 사용합니다. Configure는
파일 저장·리소스 시작·승인을 하지 않습니다. 에이전트 설정은 CLI describe/get/patch/validate로 접근하며 파일을 직접 읽거나 수정하지 않습니다.

호환성을 위해 `run_tests`에서 `kind`를 생략하면 Integration입니다. id-only `get_run`
요청(`{"id":"..."}`)은 기존 전체 Integration 실행·검토 응답을 유지합니다. 명시적인 `kind`는
세 종류 모두 제한된 결과 계약을 선택합니다. 상태·판정·정리·캡처된 `identity`·케이스 개수와
최대 20개 실패 및 20개 산출물 메타데이터, 전체 `failureCount`/`artifactCount`/`evidenceCount`,
`truncated`를 반환합니다. 메시지와 라벨은 2,048자로 제한합니다. 기본 결과에 원시 케이스 본문,
stdout/stderr와 설정 원문을 복제하지 않습니다. `evidence`, 산출물 `retrieval`, `reviewPath`로
상세를 확인하세요. 대기 요청은 승인 카드를 유지하며 실행 수락을 의미하지 않습니다. 기존 `run_unit_tests` / `run_playwright`는
해당 kind를 지정한 `run_tests`로, `get_execution`은 `get_run`으로,
`list_executions`는 `list_runs`로 변경하세요. 이전 도구 이름은 노출하지 않습니다.

```json
{"kind":"unit","path":"/absolute/checkout"}
{"kind":"integration","path":"/absolute/checkout","tests":["service.test.ts"]}
{"kind":"playwright","path":"/absolute/checkout","target":"functional"}
```

`list_runs`의 커서를 사용할 때 같은 체크아웃과 종류 필터를 유지하세요. 존재하지만 관찰하지 않은
체크아웃은 등록 없이 빈 이력을 반환하며 존재하지 않는 경로는 입력 오류입니다. `get_run`의 `detail: source`는 `sourcePath`가
필요하며 캡처된 Integration·Playwright 소스를 읽습니다. Unit은 전체 명령 출력을 보존합니다.
`detail: log`는 최대 65,536자로 제한하고 잘림 여부를 반환하며 기존 실행 시 비밀값 마스킹을
유지합니다. `detail: image`는 해당 실행의 Playwright PNG를 받습니다. `get_run_artifact`는
바이트를 읽기 전에 실행·side 소유권을 검증하고 PNG는 이미지, 영상·trace는 내장 리소스로
반환합니다. 더 큰 산출물은 뷰어에서 확인합니다. 증거는 소스 최신성이나 사람의 수락이 아닙니다.

모든 종류는 요청 시 승인 정책을 보존합니다. Auto는 기존 워크플로를 시작하고 Ask는 프로젝트
코드를 실행하지 않은 검토를 반환합니다. Integration은 환경 승인 후 테스트 승인이 필요하며
Unit·Playwright는 캡처된 요청 하나를 승인합니다. 모델은 승인하거나 정책을 바꿀 수 없습니다.
대기 검토에는 실행 증거가 없습니다. 수락 후 Unit·Playwright 검토 ID는 실행 증거로 연결되며
Integration 로그·소스는 실제 실행 ID를 사용합니다.

테스트 취소 도구, HTTP 취소 엔드포인트, 뷰어 취소 버튼과 테스트 환경 강제 종료 경로는
노출하지 않습니다. timeout·서버 종료·실패 복구·증거 보존·자동 정리는 내부 수명주기로
유지합니다. 과거 취소 결과는 계속 조회할 수 있습니다. 수동 환경 종료로 테스트를 취소할 수 없습니다.

`project_container`는 관찰된 연결 프로젝트가 필요하며 실제 `path` 워크트리에서
inspect/start/restart/stop을 수행합니다. 조회는 실행하지 않으며 공유 설정과 입력 검사를
적용합니다. 준비 상태·실패는 inspect로 조회합니다. 수동 작업 접수는 프로젝트별로 직렬화하며
메인 생략 요청과 명시적 워크트리 요청도 같은 잠금을 사용합니다. Stop은 해당 워크트리의 수동 환경만
대상으로 하며 소유 리소스 teardown 완료 전에는 종료 완료가 아닙니다. 수동 환경은 서버
종료 후 유지되고 재시작 시 재연결되며 테스트 실행 리소스로 재사용할 수 없습니다.
HTTP `/api/projects/:id/test-container` 및 action/compose 경로는 선택적인 `worktreeId`를
받습니다. 생략하면 설정된 메인 체크아웃을 사용하며 다른 프로젝트의 워크트리는 거부합니다.
임의 Docker 명령이나 다른 리소스 삭제는 노출하지 않습니다. 설정 누락·체크아웃 문제는 진단입니다.

전체 앱은 프로젝트 관리·설정·파일 탐색·Git·수동 Container 제어를 유지합니다. MCP는 Git 변경,
설정 쓰기와 승인 기능을 모델에 노출하지 않습니다. [실행](execution.md),
[설정 소유권](settings-reference.md), [Git 작업](git.md)을 참고하세요.

## 요청 승인과 Apps

번들 리소스는 `ui://redpact/environment.html`, `ui://redpact/tests.html`입니다.
응답 snapshot을 표시하며 지속 polling·구독을 하지 않습니다. Environment 카드는 실행 시
의존성 선택 없이 각 의존성의 고정 종류를 한 번씩 표시합니다. `get_run`은 Integration
snapshot을, `get_run`은 Unit/Playwright 검토를 갱신합니다. 연결된 뷰어에서 실행
이력·상세 증거·복구 제어를 확인합니다.

새 실행 요청은 인스턴스 `approval` 정책을 캡처합니다.

- `auto`: 즉시 실행을 수락합니다.
- `ask`: `awaiting_approval` 검토 ID를 반환합니다. Integration은 환경 승인 후 테스트
  묶음을 승인합니다. Unit은 전체 명령·Dockerfile·디렉터리·입력 식별자를 보여줍니다.
  Playwright는 선언된 대상·목적·viewport와 앱·테스트 입력 식별자를 보여줍니다.
  필요한 명시적 승인 전에는 컨테이너나 테스트 프로세스를 시작하지 않습니다.

Integration 승인은 캡처된 제출·고정 실행 계획·revision·설정 digest에 결합되며 나중의
파일 변경은 캡처 테스트를 대체하지 않습니다. Unit과 Playwright 승인은 캡처한 실행 명세와
설정·입력 digest에 결합됩니다. 수락 시 입력을 다시 읽고, 바뀐 입력을 대신 승인하지 않고
거부합니다. Unit은 컨테이너 빌드 전에 복사한 소스를 확인하고, Playwright는 캡처한 테스트를
확인한 뒤 승인된 앱 식별자를 환경 준비 단계까지 전달합니다. 외부 입력과 fingerprint의
한계는 [실행](execution.md)을 참고하세요. 승인은 테스트 충분성·TDD red·코드 변경에 대한
사람의 수락을 입증하지 않습니다.

App 전용 `review_action`, `execution_review_action`, `set_approval_policy`는 이를
준수하는 클라이언트에서 모델에 숨겨집니다. 추측 불가능한 capability는 UI 전용 `_meta`로만
전달되며 모델 콘텐츠에 포함되지 않습니다. Revision 검사로 오래된 작업을 거부하고 중복
최종 승인은 기존 실행을 반환합니다. 기본 정책 변경은 새 요청에만 적용됩니다. Apps가 없는
호스트는 연결된 검토 화면에서 명시적으로 승인할 수 있지만 텍스트 승인으로 대체하거나
Ask를 Auto로 몰래 바꿀 수 없습니다. 뷰어의 명시적 검토 동작도 같은 workflow를 사용하며
아래의 신뢰된 로컬 HTTP 경계를 유지합니다.

브라우저 번들은 공식 Apps SDK를 사용하며 서버는 기존 SDK로 리소스·도구 메타데이터를
등록합니다. 카드에 에셋을 포함하고 iframe HTTP 대신 host bridge를 사용합니다.
영속 검토 복구는 [저장소](storage.md)에서 설명합니다.

## CLI 대화 맥락

`redpact workspace status`는 지정한 체크아웃을 등록하거나 코드를 실행하지 않고 조회합니다.
공유 설정 루트와 진단, 이미 관찰된 연결, 승인 대기와 제한된 실행 요약을 반환합니다.
활성 실행과 미완료 정리는 최근 이력 페이지와 별도로 조회합니다. 상태는 관찰한 사실과 진단을 보고하며 명령을 지시하거나 작업을 미리 승인하지 않습니다.

`redpact runs context`는 실행 또는 대기 요청 하나의 제한된 실패 정보, 근거 참조와 상대
`reviewPath`를 반환합니다. 같은 뷰어 출처와 결합해서 사용하며 환경 인증 값이나 UI
capability는 포함하지 않습니다. 실패·근거 참조를 각각 최대 20개와 전체 개수로 반환하고,
보존된 상세는 CLI의 `runs logs/source/artifact`와 뷰어에서 확인합니다. 관련 현재 입력을 실제로 비교하기 전에는
최신성이 `unknown`이며 사람의 수락은 `not_recorded`입니다. Unit 명령 실패를 자동으로
assertion 실패로 분류하지 않습니다.

Integration 승인 미리보기는 요청 당시 저장된 앱 서비스 선택, 의존성 종류와 제출된
테스트 파일·시나리오 제목을 보여줍니다. 서비스 이름은 최대 50개와 전체 `serviceCount`로
반환합니다. 현재 설정 대신 저장된 요청을 사용하며 뷰어의 환경 승인 동작 전에 표시합니다.

Playwright 종료만으로 환경 제거를 증명하지 않습니다. 카드와 검토 요약은 명시적인 정리
근거가 없으면 정리를 `unknown`으로, 정리 오류가 기록되었으면 `failed`로 표시합니다.

정확한 기록 뷰어는 `GET /api/review-context?kind=...&id=...`를 사용합니다.
`GET /api/workspace-status?path=...`는 읽기 전용 체크아웃 관찰 API입니다. 명시적인 뷰어 승인은
`/api/execution-reviews/:kind/:id/approve`를 사용하며 승인은 예상 revision과
Integration의 해당 승인 대상을 확인합니다. 기존 same-origin·local-host 경계를 유지합니다.
모델용 도구에는 뷰어 승인 작업을 노출하지 않습니다. [탐색](frontend.md)을 참고하세요.

워크트리의 `scope=evidence` 이벤트 구독에는 Integration과 Unit/Playwright 검토 기록,
보존된 실행 근거와 공유 프로젝트 설정이 포함됩니다. 다른 워크트리의 기록을 받지 않으면서
채팅으로 만든 요청과 승인 변경을 연결된 검토 화면에 반영합니다. 명시적인 워크트리
ID가 필요하며 체크아웃을 사용할 수 없어도 보존된 실행 근거를 계속 관찰합니다.

## 로컬 접근 경계

기본 및 데스크톱 실행은 loopback에 bind합니다. 서버는 loopback Host, 정확한 browser
Origin과 Fetch Metadata도 검사하고 cross-site/same-site 요청을 거부합니다.
Bearer token은 필요 없습니다. 신뢰된 로컬 프로세스는 HTTP와 파일에 접근할 수 있어
사용자 간 격리나 악성 로컬 프로세스로부터의 격리가 아닙니다.

컨테이너 관찰은 명시적으로 `--host 0.0.0.0`으로 실행하되 호스트 loopback에만 포트를
공개할 수 있습니다. 원격 인증이나 다중 사용자 접근을 도입하는 것은 아닙니다.
전송이나 preview 연결을 바꿔도 수락 검사를 보존하세요.

구현: [MCP 등록](../app/server/src/interfaces/mcp/routes.ts),
[App 메타데이터](../app/server/src/interfaces/mcp/apps.ts),
[HTTP 문서](../app/server/src/interfaces/http/docs/routes.ts),
[검토 workflow](../app/server/src/workflows/review-tests.ts).

런타임 업데이트 상태와 명시적 확인·설치는 `GET /api/updates`, `POST /api/updates/check`, `POST /api/updates/install`을 사용합니다. 설치에는 발견된 버전과 일치하는 `{ version }`과 확인된 CLI 부모 프로세스가 필요합니다. 캐시의 `canInstall`, `busy`, `error`, `installError`는 기능 지원·작업·실패를 구분합니다. 조회는 설치하지 않습니다. 같은 출처·로컬 호스트 경계를 유지하고 임의 명령이나 레지스트리 URL을 받지 않습니다. [런타임 업데이트](installation.md)를 참고하세요.

## 현재 테스트 목록과 소스

`GET /api/worktrees/:id/unit-tests`와 `/integration-tests`는 메타데이터만 포함하는
목록 항목(`path`)을 반환하며 `scope=all|changed`와 기본값 `changed`를 유지합니다.
선택한 현재 소스 하나는 대응하는 `/unit-tests/source?path=...` 또는
`/integration-tests/source?path=...` 엔드포인트로 읽습니다.
디코딩한 경로는 설정된 Git 가시 테스트 목록에 속해야 합니다. 잘못된 선택은 400을,
파일 미리보기 실패는 `{ path, source: null, issue }`를 반환합니다.
읽기에 성공하면 `{ path, source }`를 반환합니다. 조회는 테스트를 실행하거나 기록된
소스를 변경하지 않습니다. 미리보기 제한과 탐색은 [파일 탐색](frontend.md)을 참고하세요.
