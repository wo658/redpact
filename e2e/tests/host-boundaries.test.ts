import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("앱의 프로젝트·환경·설정 관리와 채팅의 실행 조회·검증을 함께 제공한다", async (context) => {
  const step = createSteps(context)
  const root = await node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/host-boundaries-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json','{}');
    console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    {
      path: root,
    },
  )
  expect(worktree.status).toBe(201)
  const projectPath = `/api/projects/${project.body.id}`
  const worktreePath = `/api/worktrees/${worktree.body.id}`
  await step("프로젝트와 환경 관리 API를 제공하며 읽기만으로 실행하지 않는다", async () => {
    const renamed = await http(projectPath, "PATCH", { name: "Managed workspace" })
    expect(renamed.status).toBe(200)
    expect(renamed.body.name).toBe("Managed workspace")
    const environment = await http<{ environment: unknown }>(`${projectPath}/test-container`)
    expect(environment.status).toBe(200)
    expect(environment.body.environment).toBeNull()
    expect((await http("/api/instance/settings")).status).toBe(200)
  })
  await step("앱 관리와 채팅 조회는 같은 원본 설정과 체크아웃 기록을 사용한다", async () => {
    const source = await http<{ source: string }>(`${projectPath}/configuration`)
    expect(source.status).toBe(200)
    expect(source.body.source).toBe("{}")
    expect((await http<{ id: string }>(worktreePath)).body.id).toBe(worktree.body.id)
    const history = await rpc<{ structuredContent: { worktreeId: string; items: unknown[] } }>(
      "tools/call",
      { name: "list_runs", arguments: { path: root } },
    )
    expect(history.structuredContent).toMatchObject({ worktreeId: worktree.body.id, items: [] })
    const validation = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
      "tools/call",
      { name: "configure", arguments: { action: "validate", path: root } },
    )
    expect(validation.structuredContent.validation.valid).toBe(true)
    expect((await http("/api/health")).status).toBe(200)
  })
}, 30000)

test("호스트 worktree를 연결하고 미완료 생성 기록을 보존하며 생성 API는 제공하지 않는다", async (context) => {
  const step = createSteps(context)
  const root = await node<string>(`
    import {mkdtempSync,writeFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root=mkdtempSync('/tmp/retired-worktree-');
    const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
    git('init','-q');writeFileSync(root+'/source.txt','retained source');git('add','.');
    git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','initial');
    git('worktree','add','-b','feature/host',root+'-checkout');
    console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  expect(
    (
      await http(`/api/projects/${project.body.id}/tracking`, "POST", {
        mainBranch: null,
        hideMerged: false,
      })
    ).status,
  ).toBe(200)
  const evidence = await node<{ id: string; record: Record<string, unknown>; bytes: string }>(
    `
    import {mkdirSync,writeFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
    import {execFileSync} from 'node:child_process';
    const {root,projectId}=JSON.parse(process.argv[1]);const id=randomUUID();
    const record={id,input:{requestId:id,projectId,intent:'과거 미완료 생성',baseRef:'HEAD',branch:'feature/host',path:root+'-checkout'},
      checkoutRoot:root+'-checkout',revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
      worktreeId:randomUUID(),workItemId:randomUUID(),createdAt:'2026-10-01T00:00:00Z',state:'attempted'};
    const bytes=JSON.stringify({version:1,data:record});
    mkdirSync('/tmp/redpact-e2e-state/work-starts',{recursive:true});
    writeFileSync('/tmp/redpact-e2e-state/work-starts/'+id+'.json',bytes);
    console.log(JSON.stringify({id,record,bytes}));
  `,
    { root, projectId: project.body.id },
  )
  await step("생성 요청은 404이고 과거 기록 조회는 원래 상태를 반환한다", async () => {
    expect((await http("/api/work-starts", "POST", evidence.record.input)).status).toBe(404)
    const record = await http(`/api/work-starts/${evidence.id}`)
    expect(record.status).toBe(200)
    expect(record.body).toEqual(evidence.record)
  })
  await step("과거 예약 경로의 실제 checkout을 발견하고 같은 식별자로 연결한다", async () => {
    const rows = await http<{ id: string; checkoutRoot: string }[]>(
      `/api/projects/${project.body.id}/worktrees`,
    )
    expect(rows.status).toBe(200)
    const found = rows.body.find((row) => row.checkoutRoot === `${root}-checkout`)
    expect(found).toBeDefined()
    const connected = await http<{ id: string }>(
      `/api/projects/${project.body.id}/worktrees`,
      "POST",
      { path: `${root}-checkout` },
    )
    expect(connected.status).toBe(201)
    expect(connected.body.id).toBe(found?.id)
  })
  await step("미완료 기록만으로 연결 해제를 막지 않으며 기록과 checkout을 보존한다", async () => {
    expect((await http(`/api/projects/${project.body.id}`, "DELETE")).status).toBe(200)
    const retained = await node<{ bytes: string; source: string }>(
      `
      import {readFileSync} from 'node:fs';const {id,root}=JSON.parse(process.argv[1]);
      console.log(JSON.stringify({bytes:readFileSync('/tmp/redpact-e2e-state/work-starts/'+id+'.json','utf8'),source:readFileSync(root+'-checkout/source.txt','utf8')}));
    `,
      { id: evidence.id, root },
    )
    expect(retained.bytes).toBe(evidence.bytes)
    expect(retained.source).toBe("retained source")
    expect((await http(`/api/work-starts/${evidence.id}`)).body).toEqual(evidence.record)
  })
}, 30000)
