import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("전체·변경 선택은 정확한 파일을 기록하고 변경 없음은 실행을 만들지 않는다", async (context) => {
  const step = createSteps(context)
  const path = await step("Git 기준과 두 Unit 테스트가 있는 격리 프로젝트를 만든다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root=mkdtempSync('/tmp/execution-scope-');const git=(...args)=>execFileSync('git',['-C',root,...args]);
    git('init','-qb','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
    mkdirSync(root+'/.redpact');mkdirSync(root+'/unit');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{executionScope:'changed'},unitTests:{dockerfile:'Dockerfile',command:'pnpm test',patterns:['unit/*.test.ts'],fileCommand:{executable:'pnpm',args:['exec','vitest','run']}}}));
    writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));
    writeFileSync(root+'/Dockerfile','FROM node:24\\nWORKDIR /workspace\\nCOPY . .\\n');
    for(const name of ['a','b'])writeFileSync(root+'/unit/'+name+'.test.ts','export const original = true;\\n');
    git('add','.');git('commit','-qm','baseline');git('checkout','-qb','feature');
    writeFileSync(root+'/unit/a.test.ts','export const changed = true;\\n');
    console.log(JSON.stringify(root));
  `),
  )
  const binding = await step("실제 앱의 프로젝트와 워크트리를 연결한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path })
    expect(project.status).toBe(201)
    const wt = await http<{ id: string }>(`/api/projects/${project.body.id}/worktrees`, "POST", {
      path,
    })
    expect(wt.status).toBe(201)
    return wt.body.id
  })
  for (const scope of ["all", "changed"] as const) {
    await step(`${scope} 요청이 선택 파일과 비교 기준을 실행 기록에 남긴다`, async () => {
      const run = await http<{
        id: string
        executionSelection: { requested: string; files: string[]; baseRevision: string | null }
      }>(`/api/worktrees/${binding}/unit-tests/run`, "POST", { executionScope: scope })
      expect(run.status).toBe(200)
      expect(run.body.executionSelection.requested).toBe(scope)
      expect(run.body.executionSelection.files).toEqual(
        scope === "all" ? ["unit/a.test.ts", "unit/b.test.ts"] : ["unit/a.test.ts"],
      )
      expect(run.body.executionSelection.baseRevision === null).toBe(scope === "all")
      await expect
        .poll(
          async () => (await http<{ state: string }>(`/api/unit-runs/${run.body.id}`)).body.state,
          { timeout: 15000 },
        )
        .toBe("finished")
      // 중첩 Docker 실행을 제공하지 않는 fixture이므로 이 단계는 파일 선택·기록 계약만 검증한다.
      const retained = await http<{ executionSelection: unknown }>(`/api/unit-runs/${run.body.id}`)
      expect(retained.body.executionSelection).toEqual(run.body.executionSelection)
    })
  }
  await step("기본 changed에 변경 파일이 없으면 실행 없이 명시적으로 거부한다", async () => {
    await node(
      `import {execFileSync} from 'node:child_process';execFileSync('git',['-C',JSON.parse(process.argv[1]),'restore','unit/a.test.ts']);console.log('null')`,
      path,
    )
    const before = await http<{ runs: unknown[] }>(`/api/worktrees/${binding}/unit-tests?scope=all`)
    const empty = await http<{ error: string }>(
      `/api/worktrees/${binding}/unit-tests/run`,
      "POST",
      {},
    )
    expect(empty.status).toBe(400)
    expect(empty.body.error).toContain("No tests selected")
    const after = await http<{ runs: unknown[] }>(`/api/worktrees/${binding}/unit-tests?scope=all`)
    expect(after.body.runs.length).toBe(before.body.runs.length)
    const mcp = await rpc<{ isError?: boolean; content: { text?: string }[] }>("tools/call", {
      name: "run_tests",
      arguments: { kind: "unit", path, executionScope: "changed" },
    })
    expect(mcp.isError).toBe(true)
    expect(JSON.stringify(mcp.content)).toContain("No tests selected")
  })
})
