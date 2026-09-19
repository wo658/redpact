import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 앱과 의존 서비스의 관계를 보존하고 구현되지 않은 권장 모드를 실행 설정으로 오인하지 않는다. */
test("앱과 의존성 지도를 조회하고 고정 모드와 구현 필요 상태를 검증한다", async (context) => {
  const step = createSteps(context)
  const root = await step("복수 앱과 외부 결제 의존성을 가진 프로젝트를 준비한다", () =>
    node<string>(`
      import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
      const root=mkdtempSync('/tmp/dependency-topology-');mkdirSync(root+'/.redpact');
      writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'},worker:{image:'alpine:3.21'}}}));
      const evidence=[{path:'src/payments.ts',line:12}];
      writeFileSync(root+'/.redpact/settings.json',JSON.stringify({
        composeFiles:['compose.yaml'],
        applicationServices:{web:{services:['app']},jobs:{services:['worker']}},
        dependencies:{payments:{modes:{remote:{env:{app:{PAYMENTS_URL:'https://example.test'}}}},
          assessments:{'isolated':{status:'unavailable',reason:'Provider has no isolated service',evidence},mock:{status:'implementation-needed',reason:'Implement the payment adapter',evidence}},
          recommendation:{mode:'mock',reason:'Deterministic local review'}}},
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
      dependencies: Record<
        string,
        { modes: Record<string, unknown>; recommendation: { mode: string } }
      >
      relationships: { from: string; to: { kind: string; name: string } }[]
    }>(`/api/projects/${created.body.id}/dependencies`)
    expect(result.body.valid).toBe(true)
    expect(result.body.applicationServices.web.services).toEqual(["app"])
    expect(result.body.applicationServices.jobs.services).toEqual(["worker"])
    expect(result.body.relationships).toHaveLength(2)
    expect(Object.keys(result.body.dependencies.payments.modes)).toEqual(["remote"])
    expect(result.body.dependencies.payments.recommendation.mode).toBe("mock")
    return created.body
  })
  await step("MCP 검증이 구현되지 않은 권장 모드의 선택을 거부한다", async () => {
    const result = await rpc<{
      structuredContent: {
        validation: { valid: boolean; issues: { code: string; path: string }[] }
        environment: { readiness: string }
      }
    }>("tools/call", {
      name: "configure",
      arguments: {
        action: "validate",
        path: root,
        selection: { services: ["app"], select: { payments: "mock" } },
      },
    })
    expect(result.structuredContent.validation.valid).toBe(false)
    expect(result.structuredContent.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "selection_unimplemented",
          path: "selection.select.payments",
        }),
      ]),
    )
    expect(result.structuredContent.environment.readiness).toBe("not_checked")
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
        selection: { services: ["app"], select: { payments: "remote" } },
      },
    })
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan.activeServices).toEqual(["app"])
    expect(result.structuredContent.environment.readiness).toBe("not_checked")
  })
  await step("HTTP 설정 편집은 sandbox 모드를 거부하고 기존 설정을 보존한다", async () => {
    const url = `/api/projects/${project.id}/configuration`
    const current = await http<{ source: string; revision: string }>(url)
    const value = JSON.parse(current.body.source)
    value.dependencies.payments.modes.sandbox = {}
    const saved = await http(url, "PUT", {
      source: JSON.stringify(value),
      revision: current.body.revision,
    })
    expect(saved.status).toBe(400)
    const after = await http<{ source: string }>(url)
    expect(after.body.source).toBe(current.body.source)
  })
})
