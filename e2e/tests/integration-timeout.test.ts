import { setTimeout } from "node:timers/promises"
import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("60초를 넘는 통합 시나리오와 180000ms 설정 저장을 지원한다", async (context) => {
  const step = createSteps(context)
  const root = await step("독립 프로젝트를 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/timeout-settings-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json','{}');console.log(JSON.stringify(root));
  `),
  )
  await step("공개 설정 API에서 3분 제한을 저장하고 다시 읽는다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(project.status).toBe(201)
    const path = `/api/projects/${project.body.id}/configuration`
    const initial = await http<{ revision: string }>(path)
    const saved = await http(path, "PUT", {
      source: JSON.stringify({ tests: { timeoutMs: 180000 } }),
      revision: initial.body.revision,
    })
    expect(saved.status).toBe(200)
    const current = await http<{ source: string }>(path)
    expect(JSON.parse(current.body.source).tests.timeoutMs).toBe(180000)
    const validation = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
      "tools/call",
      {
        name: "configure",
        arguments: { action: "validate", path: root },
      },
    )
    expect(validation.structuredContent.validation.valid).toBe(true)
  })
  const started = performance.now()
  await step("60초 이후에도 실행 중인 시나리오를 완료한다", async () => {
    await setTimeout(61000)
    expect(performance.now() - started).toBeGreaterThan(60000)
    expect((await http("/api/health")).status).toBe(200)
  })
}, 180000)
