import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

test("두 테스트 목록은 변경된 파일과 실제 소스를 실행 없이 제공한다", async (context) => {
  const step = createSteps(context)
  const root = await step("기존 테스트를 수정하고 새 테스트를 추가한다", () =>
    node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/test-file-review-');
    const git=(...args)=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null',...args]);
    git('init','-qb','main'); git('config','user.name','Test'); git('config','user.email','test@example.com');
    mkdirSync(root+'/.redpact'); mkdirSync(root+'/acceptance');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{directory:'acceptance'},unitTests:{command:'node --version',patterns:['*.test.ts']}}));
    writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));
    writeFileSync(root+'/unit.test.ts','old unit'); writeFileSync(root+'/acceptance/api.test.ts','old integration');
    writeFileSync(root+'/acceptance/unchanged.test.ts','unchanged');
    git('add','.'); git('commit','-qm','baseline');
    writeFileSync(root+'/unit.test.ts','changed unit'); writeFileSync(root+'/acceptance/api.test.ts','changed integration');
    writeFileSync(root+'/acceptance/new.test.ts','new integration');
    console.log(JSON.stringify(root));
  `),
  )
  const worktreeId = await step("공개 API로 프로젝트를 연결한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(project.status).toBe(201)
    const worktrees = await http<{ id: string }[]>(`/api/projects/${project.body.id}/worktrees`)
    expect(worktrees.status).toBe(200)
    return worktrees.body[0].id
  })
  await step("통합테스트의 추가와 수정 파일만 원본 경로로 조회한다", async () => {
    const result = await http<{
      directory: string
      catalog: { files: { path: string; source: string }[]; diagnostics: string[] }
    }>(`/api/worktrees/${worktreeId}/integration-tests`)
    expect(result.status).toBe(200)
    expect(result.body.directory).toBe("acceptance")
    expect(result.body.catalog.diagnostics).toEqual([])
    expect(result.body.catalog.files).toEqual([
      { path: "acceptance/api.test.ts", source: "changed integration" },
      { path: "acceptance/new.test.ts", source: "new integration" },
    ])
  })
  await step("단위테스트의 수정 파일을 실행 기록 생성 없이 조회한다", async () => {
    const result = await http<{
      catalog: { files: { path: string; source: string }[] }
      runs: unknown[]
    }>(`/api/worktrees/${worktreeId}/unit-tests`)
    expect(result.status).toBe(200)
    expect(result.body.catalog.files).toEqual([{ path: "unit.test.ts", source: "changed unit" }])
    expect(result.body.runs).toEqual([])
  })
}, 60000)
