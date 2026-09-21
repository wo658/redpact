import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node, rpc } from "./target"

test("고정 프로젝트 설정을 선택 없이 검증하고 실행 계획을 반환한다", async (context) => {
  const step = createSteps(context)
  const root = await step("고정 앱과 관리 의존성을 선언한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/fixed-settings-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/compose.yaml',JSON.stringify({services:{app:{image:'alpine:3.21'},db:{image:'postgres:17-alpine'}}}));
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({composeFiles:['compose.yaml'],services:['app'],dependencies:{database:{kind:'isolated',services:['db']}}}));
    console.log(JSON.stringify(root));
  `),
  )
  await step("선택 입력 없이 두 서비스를 포함한 계획을 확인한다", async () => {
    const result = await rpc<{
      structuredContent: { validation: { valid: boolean }; plan: { activeServices: string[] } }
    }>("tools/call", { name: "configure", arguments: { action: "validate", path: root } })
    expect(result.structuredContent.validation.valid).toBe(true)
    expect(result.structuredContent.plan.activeServices).toEqual(["app", "db"])
  })
})
