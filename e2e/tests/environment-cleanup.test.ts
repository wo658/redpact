import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** Docker가 없는 대상에서는 입력 확인 실패를 기록하고 실행 환경을 생성하지 않는다. */
test("Docker가 없는 앱에서 입력 확인 실패를 기록하고 환경을 생성하지 않는다", async (context) => {
  const step = createSteps(context)
  const path = await step("실제 서버에 테스트 프로젝트 파일을 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const path = mkdtempSync('/tmp/cleanup-acceptance-');
    mkdirSync(path+'/.redpact'); mkdirSync(path+'/tests');
    writeFileSync(path+'/.redpact/settings.json', JSON.stringify({composeFiles:['compose.yaml'],services:['app'],tests:{directory:'tests'}}));
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
      arguments: { path },
    }),
  )
  await step("실행 요청이 승인 대기 없이 접수됐는지 확인한다", () => {
    expect(response.isError).not.toBe(true)
    expect(response.structuredContent.state).not.toBe("awaiting_approval")
  })
  const id = response.structuredContent.id
  await step("입력 확인 실패가 실행 기록으로 남는지 확인한다", async () => {
    await expect
      .poll(async () => (await http<{ state: string }>(`/api/runs/${id}`)).body.state, {
        timeout: 15000,
        interval: 300,
      })
      .toBe("finished")
    const result = await http<{
      result: { outcome: string }
      environmentId?: string
      environment?: unknown
    }>(`/api/runs/${id}`)
    expect(result.body.result.outcome).toBe("execution_error")
    expect(result.body.environmentId).toBeFalsy()
    expect(result.body.environment).toBeUndefined()
  })
  await step("실행이 소유하는 환경 기록이나 임시 소스가 생성되지 않았는지 확인한다", async () => {
    const count = await node<number>(
      `
      import {existsSync,readdirSync,readFileSync} from 'node:fs';
      const directory='/tmp/redpact-e2e-state/environments';
      const id=JSON.parse(process.argv[1]);
      const records=existsSync(directory)?readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(readFileSync(directory+'/'+name,'utf8'))):[];
      console.log(JSON.stringify(records.filter(record=>record.requestId===id).length));
    `,
      id,
    )
    expect(count).toBe(0)
  })
}, 60000)
