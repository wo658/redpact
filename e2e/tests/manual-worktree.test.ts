import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("수동 환경 조회는 요청한 워크트리에 귀속되고 고정 포트 설정을 검증한다", async (context) => {
  const step = createSteps(context)
  const paths = await step("메인과 기능 워크트리 및 공통 고정 포트 설정을 준비한다", () =>
    node<{ main: string; feature: string }>(`
    const {mkdtempSync,mkdirSync,writeFileSync}=await import('node:fs');
    const {execFileSync}=await import('node:child_process');
    const main=mkdtempSync('/tmp/manual-worktree-');mkdirSync(main+'/.redpact');
    writeFileSync(main+'/compose.yaml','services:\\n  app:\\n    image: alpine:3.21\\n    ports: ["3000"]\\n');
    writeFileSync(main+'/.redpact/settings.json',JSON.stringify({composeFiles:['compose.yaml'],services:['app'],dependencies:{preview:{kind:'isolated',services:['app'],hostPorts:[{service:'app',target:3000,published:33001}]}}}));
    const git=(...args)=>execFileSync('git',args,{cwd:main});git('init','-b','main');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.com','commit','-m','fixture');
    const feature=main+'-feature';git('worktree','add','-b','feature',feature);
    execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.com','commit','--allow-empty','-m','feature'],{cwd:feature});
    console.log(JSON.stringify({main,feature}));
  `),
  )
  const project = await step("실제 프로젝트와 기능 워크트리를 연결한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: paths.main })
    expect(response.status).toBe(201)
    return response.body
  })
  await step("MCP는 기능 체크아웃을 메인으로 대체하지 않는다", async () => {
    const response = await rpc<{
      structuredContent: { target: { id: string; projectRoot: string }; environment: unknown }
    }>("tools/call", {
      name: "project_container",
      arguments: { path: paths.feature, action: "inspect" },
    })
    expect(response.structuredContent.target.projectRoot).toBe(paths.feature)
    expect(response.structuredContent.environment).toBeNull()
    const httpView = await http<{ target: { id: string; projectRoot: string } }>(
      `/api/projects/${project.id}/test-container?worktreeId=${response.structuredContent.target.id}`,
    )
    expect(httpView.body.target.projectRoot).toBe(paths.feature)
  })
  await step("공통 설정 검증은 고정 포트를 허용하되 실행을 시작하지 않는다", async () => {
    const response = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
      "tools/call",
      { name: "configure", arguments: { path: paths.feature, action: "validate" } },
    )
    expect(response.structuredContent.validation.valid).toBe(true)
  })
}, 30000)
