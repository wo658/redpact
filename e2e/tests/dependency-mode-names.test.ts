import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("네 고정 의존성 종류를 함께 구성하고 실행 선택 API를 거부한다", async (context) => {
  const step = createSteps(context)
  const path = await step("관리 서비스와 외부 연결을 함께 선언한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/fixed-kinds-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'},db:{image:'postgres:17'},payments:{image:'alpine:3.21'}}}));
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({composeFiles:['compose.yaml'],services:['app'],dependencies:{database:{kind:'isolated',services:['db']},payments:{kind:'mock',services:['payments']},search:{kind:'shared-local',env:{app:{SEARCH_URL:'http://host.docker.internal:9200'}}},remote:{kind:'remote',env:{app:{API_URL:'https://api.example.test'}}}}}));
    console.log(JSON.stringify(root));
  `),
  )
  const project = await http<{ id: string }>("/api/projects", "POST", { path })
  expect(project.status).toBe(201)
  await step("선택 없이 고정 실행 계획을 검증한다", async () => {
    const result = await rpc<{
      isError?: boolean
      structuredContent: { validation: { valid: boolean }; plan: { activeServices: string[] } }
    }>("tools/call", { name: "configure", arguments: { action: "validate", path } })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan.activeServices).toEqual(["app", "db", "payments"])
  })
  await step("외부 연결의 서비스 생성과 이전 모드 카탈로그를 거부한다", async () => {
    const endpoint = `/api/projects/${project.body.id}/configuration`
    const current = await http<{ source: string; revision: string }>(endpoint)
    for (const kind of ["shared-local", "remote"]) {
      const settings = JSON.parse(current.body.source)
      settings.dependencies.search = { kind, services: ["db"] }
      expect(
        (
          await http(endpoint, "PUT", {
            source: JSON.stringify(settings),
            revision: current.body.revision,
          })
        ).status,
      ).toBe(400)
    }
    const result = await rpc<{ isError?: boolean }>("tools/call", {
      name: "configure",
      arguments: { action: "validate", path, selection: { services: ["app"], select: {} } },
    })
    expect(result.isError).toBe(true)
  })
})
