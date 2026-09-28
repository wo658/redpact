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

/** 원문 JSON 값은 추가 비밀값 등록 없이 저장되며 앱과 테스트의 주입 대상은 분리된다. */
test("원문 key-value는 특수문자와 빈 문자열을 보존하고 비밀값 등록을 요구하지 않는다", async (context) => {
  const step = createSteps(context)
  const root = await step("앱과 테스트 값의 저장 위치를 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/direct-environment-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'}}}));
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({composeFiles:['compose.yaml'],services:['app']}));
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("프로젝트를 연결한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(response.status).toBe(201)
    return response.body
  })
  const values = { TOKEN: "fixture=value $literal", EMPTY: "", MULTILINE: "first\nsecond" }
  await step("앱과 테스트의 원문 값을 JSON으로 저장한다", async () => {
    const current = await http<{ source: string; revision: string }>(
      `/api/projects/${project.id}/configuration`,
    )
    const source = JSON.parse(current.body.source)
    source.dependencies = { provider: { kind: "remote", env: { app: values } } }
    source.tests = { env: { TOKEN: "runner-only" } }
    const saved = await http(`/api/projects/${project.id}/configuration`, "PUT", {
      source: JSON.stringify(source),
      revision: current.body.revision,
    })
    expect(saved.status).toBe(200)
  })
  await step("원문과 주입 대상 분리 및 비밀값 등록 불필요를 확인한다", async () => {
    const saved = await http<{ source: string }>(`/api/projects/${project.id}/configuration`)
    const settings = JSON.parse(saved.body.source)
    expect(settings.dependencies.provider.env.app).toEqual(values)
    expect(settings.tests.env).toEqual({ TOKEN: "runner-only" })
    const secrets = await http(`/api/projects/${project.id}/secrets`)
    expect(secrets.status).toBe(200)
    expect(secrets.body).toEqual([])
    const result = await rpc<{
      structuredContent: { validation: { valid: boolean }; plan: { requiredSecrets: string[] } }
    }>("tools/call", { name: "configure", arguments: { action: "validate", path: root } })
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan.requiredSecrets).toEqual([])
  })
})
