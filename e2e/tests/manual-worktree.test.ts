import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

type CliResult<T> = {
  exit: number
  payload: { version: number; ok: boolean; data: T; error?: { code: string } }
}

async function cli<T>(args: string[]) {
  return node<CliResult<T>>(
    `
    import {spawnSync} from 'node:child_process';
    const args=JSON.parse(process.argv[1]);
    const result=spawnSync(process.execPath,[
      '/app/app/server/dist/cli.js','--server','http://127.0.0.1:54318',...args,'--json'
    ],{encoding:'utf8',timeout:20000});
    if(result.error) throw result.error;
    console.log(JSON.stringify({exit:result.status,payload:JSON.parse(result.stdout)}));
    `,
    args,
  )
}

function succeeded<T>(result: CliResult<T>) {
  expect(result.exit).toBe(0)
  expect(result.payload).toMatchObject({ version: 1, ok: true })
  return result.payload.data
}

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
  await step("연결되지 않은 체크아웃 조회는 CLI 오류를 반환하고 환경을 만들지 않는다", async () => {
    const result = await cli(["environment", "inspect", "--path", paths.feature])
    expect(result.exit).toBe(2)
    expect(result.payload).toMatchObject({ version: 1, ok: false, error: { code: "NOT_FOUND" } })
  })
  const project = await step("실제 프로젝트와 기능 워크트리를 연결한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: paths.main })
    expect(response.status).toBe(201)
    const linked = await http<{ id: string }>(
      `/api/projects/${response.body.id}/worktrees`,
      "POST",
      {
        path: paths.feature,
      },
    )
    expect(linked.status).toBe(201)
    return response.body
  })
  await step("CLI는 기능 체크아웃을 메인으로 대체하지 않는다", async () => {
    const response = succeeded(
      await cli<{
        target: { id: string; projectRoot: string }
        environment: unknown
      }>(["environment", "inspect", "--path", paths.feature]),
    )
    expect(response.target.projectRoot).toBe(paths.feature)
    expect(response.environment).toBeNull()
    const httpView = await http<{ target: { id: string; projectRoot: string } }>(
      `/api/projects/${project.id}/test-container?worktreeId=${response.target.id}`,
    )
    expect(httpView.body.target.projectRoot).toBe(paths.feature)
  })
  await step("공통 설정 검증은 고정 포트를 허용하되 실행을 시작하지 않는다", async () => {
    const response = succeeded(
      await cli<{ valid: boolean; readiness: string; approval: string }>([
        "settings",
        "validate",
        "--scope",
        "project",
        "--path",
        paths.feature,
      ]),
    )
    expect(response).toMatchObject({
      valid: true,
      readiness: "not_checked",
      approval: "not_checked",
    })
    const environment = succeeded(
      await cli<{ environment: unknown }>(["environment", "inspect", "--path", paths.feature]),
    )
    expect(environment.environment).toBeNull()
  })
}, 30000)
