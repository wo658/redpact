import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

/** 폐기한 값 타입과 별도 인증 입력 경로는 더 이상 계약에 노출하지 않는다. */
test("환경변수는 문자열만 수락하고 secret API와 MCP 도구를 제거한다", async (context) => {
  const step = createSteps(context)
  const root = await node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/flat-inputs-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{env:{TOKEN:'original'}}}));
    console.log(JSON.stringify(root));
  `)
  const project = (await http<{ id: string }>("/api/projects", "POST", { path: root })).body
  await step("별도 인증 API와 모델 도구가 없음을 확인한다", async () => {
    for (const path of ["secrets", "secrets/TOKEN"]) {
      expect((await http(`/api/projects/${project.id}/${path}`)).status).toBe(404)
    }
    expect(
      (await http(`/api/projects/${project.id}/secrets/TOKEN`, "PUT", { value: "unused" })).status,
    ).toBe(404)
    const result = await rpc<{ tools: { name: string }[] }>("tools/list", {})
    expect(result.tools.map((tool) => tool.name)).not.toContain("request_keys")
    expect(result.tools.map((tool) => tool.name)).not.toContain("submit_key")
  })
  await step("직접 작성한 secret와 host·port·URL 객체를 검증에서 거부한다", async () => {
    for (const value of [
      { secret: "TOKEN" },
      { service: "app", port: 3000, value: "host" },
      { service: "app", port: 3000, value: "port" },
      { service: "app", port: 3000, scheme: "http" },
    ]) {
      const source = JSON.stringify({ tests: { env: { TOKEN: value } } })
      await node(
        `import {writeFileSync} from 'node:fs'; const {root,source}=JSON.parse(process.argv[1]);writeFileSync(root+'/.redpact/settings.json',source);console.log('null');`,
        { root, source },
      )
      const result = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
        "tools/call",
        { name: "configure", arguments: { action: "validate", path: root } },
      )
      expect(result.structuredContent.validation.valid).toBe(false)
      const after = await http<{ source: string }>(`/api/projects/${project.id}/configuration`)
      expect(after.body.source).toBe(source)
    }
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
    await node(
      `import {writeFileSync} from 'node:fs';const {root,source}=JSON.parse(process.argv[1]);writeFileSync(root+'/.redpact/settings.json',JSON.stringify(source));console.log('null');`,
      { root, source },
    )
  })
  await step("원문과 주입 대상 분리 및 비밀값 등록 불필요를 확인한다", async () => {
    const saved = await http<{ source: string }>(`/api/projects/${project.id}/configuration`)
    const settings = JSON.parse(saved.body.source)
    expect(settings.dependencies.provider.env.app).toEqual(values)
    expect(settings.tests.env).toEqual({ TOKEN: "runner-only" })
    const secrets = await http(`/api/projects/${project.id}/secrets`)
    expect(secrets.status).toBe(404)
    const result = await rpc<{
      structuredContent: { validation: { valid: boolean }; plan: Record<string, unknown> }
    }>("tools/call", { name: "configure", arguments: { action: "validate", path: root } })
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan).not.toHaveProperty("requiredSecrets")
  })
})
