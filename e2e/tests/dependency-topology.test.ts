import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 앱과 의존 서비스의 관계를 보존하고 관계 선언만으로 서비스를 시작하지 않는다. */
test("앱과 의존성 지도를 조회하고 고정 연결 종류를 검증한다", async (context) => {
  const step = createSteps(context)
  const root = await step("복수 앱과 외부 결제 의존성을 가진 프로젝트를 준비한다", () =>
    node<string>(`
      import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
      const root=mkdtempSync('/tmp/dependency-topology-');mkdirSync(root+'/.redpact');
      writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'},worker:{image:'alpine:3.21'}}}));
      const evidence=[{path:'src/payments.ts',line:12}];
      writeFileSync(root+'/.redpact/settings.json',JSON.stringify({
        composeFiles:['compose.yaml'],services:['app'],
        applicationServices:{web:{services:['app']},jobs:{services:['worker']}},
        dependencies:{payments:{kind:'remote',env:{app:{PAYMENTS_URL:'https://example.test'}}}},
        relationships:[{from:'web',to:{kind:'application',name:'jobs'},description:'Dispatch jobs',evidence},{from:'web',to:{kind:'dependency',name:'payments'},description:'Capture payment',evidence}]
      }));
      console.log(JSON.stringify(root));
    `),
  )
  const project = await step("프로젝트를 연결하고 앱과 의존성 관계를 조회한다", async () => {
    const created = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(created.status).toBe(201)
    const result = await http<{
      valid: boolean
      applicationServices: Record<string, { services: string[] }>
      dependencies: Record<string, { kind: string }>
      relationships: { from: string; to: { kind: string; name: string } }[]
    }>(`/api/projects/${created.body.id}/dependencies`)
    expect(result.body.valid).toBe(true)
    expect(result.body.applicationServices.web.services).toEqual(["app"])
    expect(result.body.applicationServices.jobs.services).toEqual(["worker"])
    expect(result.body.relationships).toHaveLength(2)
    expect(result.body.dependencies.payments.kind).toBe("remote")
    return created.body
  })
  await step("원격 연결 선택은 관계만 선언된 worker를 실행 대상으로 추가하지 않는다", async () => {
    const result = await rpc<{
      structuredContent: {
        validation: { valid: boolean }
        plan: { activeServices: string[] }
        environment: { readiness: string }
      }
    }>("tools/call", {
      name: "configure",
      arguments: {
        action: "validate",
        path: root,
      },
    })
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan.activeServices).toEqual(["app"])
    expect(result.structuredContent.environment.readiness).toBe("not_checked")
  })
  await step(
    "직접 작성한 sandbox 종류는 검증에서 거부하고 파일을 자동 수정하지 않는다",
    async () => {
      const url = `/api/projects/${project.id}/configuration`
      const current = await http<{ source: string; revision: string }>(url)
      const value = JSON.parse(current.body.source)
      value.dependencies.payments.kind = "sandbox"
      const source = JSON.stringify(value)
      await node(
        `import {writeFileSync} from 'node:fs';const {root,source}=JSON.parse(process.argv[1]);writeFileSync(root+'/.redpact/settings.json',source);console.log('null');`,
        { root, source },
      )
      const validation = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
        "tools/call",
        { name: "configure", arguments: { action: "validate", path: root } },
      )
      expect(validation.structuredContent.validation.valid).toBe(false)
      const after = await http<{ source: string }>(url)
      expect(after.body.source).toBe(source)
    },
  )
})
