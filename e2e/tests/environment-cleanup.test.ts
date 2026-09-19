import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 환경 준비에 실패해도 실행 기록과 로그를 남기고 임시 환경 데이터를 제거한다. */
test("통합테스트 환경 준비 실패 후 자동 정리와 로그 보존", async (context) => {
  const step = createSteps(context)
  const path = await step("실제 서버에 테스트 프로젝트 파일을 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const path = mkdtempSync('/tmp/cleanup-acceptance-');
    mkdirSync(path+'/.redpact'); mkdirSync(path+'/tests');
    writeFileSync(path+'/.redpact/settings.json', JSON.stringify({composeFiles:['compose.yaml']}));
    writeFileSync(path+'/compose.yaml','services:\\n  app:\\n    image: alpine:3.21\\n');
    writeFileSync(path+'/tests/check.test.ts','import {test,expect} from "vitest"; test("검증",()=>expect(true).toBe(true))');
    console.log(JSON.stringify(path));
  `),
  )
  const response = await step("MCP로 통합테스트를 요청한다", () =>
    rpc<{
      isError?: boolean
      structuredContent: { id: string; state: string }
    }>("tools/call", {
      name: "run_tests",
      arguments: { path, selection: { services: ["app"], select: {} } },
    }),
  )
  await step("실행 요청이 승인 대기 없이 접수됐는지 확인한다", () => {
    expect(response.isError).not.toBe(true)
    expect(response.structuredContent.state).not.toBe("awaiting_approval")
  })
  const id = response.structuredContent.id
  let environmentId = ""
  await step("준비 실패와 자동 정리 완료를 확인한다", async () => {
    await expect
      .poll(
        async () => {
          const result = await http<{
            state: string
            environmentId?: string
            result?: { outcome: string }
            environment?: { state: string }
          }>(`/api/runs/${id}`)
          environmentId = result.body.environmentId ?? ""
          return {
            run: result.body.state,
            outcome: result.body.result?.outcome,
            environment: result.body.environment?.state,
          }
        },
        { timeout: 15000, interval: 300 },
      )
      .toEqual({ run: "finished", outcome: "environment_error", environment: "stopped" })
  })
  await step("임시 소스는 삭제되고 준비 로그는 보존됐는지 확인한다", async () => {
    const files = await node<{ source: boolean; log: boolean }>(
      `
      import {existsSync} from 'node:fs';
      const id=JSON.parse(process.argv[1]); const root='/tmp/redpact-e2e-state/environments/'+id;
      console.log(JSON.stringify({source:existsSync(root+'/source'),log:existsSync(root+'/preparation.log')}));
    `,
      environmentId,
    )
    expect(files).toEqual({ source: false, log: true })
  })
}, 60000)
