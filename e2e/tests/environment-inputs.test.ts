import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 일반 값은 원문으로 유지하고 외부 인증 키만 별도의 초기 입력 카드로 요청한다. */
test("환경변수 원문 편집과 필요한 인증 키 입력은 실행 없이 저장된다", async (context) => {
  const step = createSteps(context)
  const root = await step("일반 값과 외부 키 참조가 있는 프로젝트를 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/environment-inputs-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{env:{URL:'https://example.test',API_KEY:{secret:'CLOUD_KEY'}}}}));
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("프로젝트를 연결하고 일반 값이 원문인지 확인한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(response.status).toBe(201)
    const settings = await http<{ source: string }>(
      `/api/projects/${response.body.id}/configuration`,
    )
    expect(JSON.parse(settings.body.source).tests.env.URL).toBe("https://example.test")
    return response.body
  })
  await step("인증 키 이름만 입력 카드로 요청하고 미입력 상태를 확인한다", async () => {
    const result = await rpc<{
      structuredContent: { inputs: { name: string; configured: boolean }[] }
      _meta: { redpact: { kind: string } }
    }>("tools/call", {
      name: "request_keys",
      arguments: { projectId: project.id, names: ["CLOUD_KEY"] },
    })
    expect(result._meta.redpact.kind).toBe("inputs")
    expect(result.structuredContent.inputs).toEqual([{ name: "CLOUD_KEY", configured: false }])
  })
  await step("웹에서 직접 저장한 값은 원문 조회와 가용성 조회에 다르게 반환된다", async () => {
    const value = "fixture-credential"
    const saved = await http(`/api/projects/${project.id}/secrets/CLOUD_KEY`, "PUT", { value })
    expect(saved.status).toBe(200)
    expect(JSON.stringify(saved.body)).not.toContain(value)
    const read = await http<{ value: string }>(`/api/projects/${project.id}/secrets/CLOUD_KEY`)
    expect(read.body.value).toBe(value)
    const statuses = await http(`/api/projects/${project.id}/secrets`)
    expect(JSON.stringify(statuses.body)).not.toContain(value)
  })
})
