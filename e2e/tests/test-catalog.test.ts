import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

test("전체·변경 목록은 200개를 넘겨 반환하고 선택 소스의 경로와 크기를 검증한다", async (context) => {
  const step = createSteps(context)
  const root = await step("실제 Git 프로젝트에 전체와 변경 테스트를 준비한다", () =>
    node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
    const root=mkdtempSync('/tmp/catalog-api-');
    const git=(...args)=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null',...args]);
    git('init','-qb','main');git('config','user.name','Test');git('config','user.email','test@example.com');
    mkdirSync(root+'/.redpact');mkdirSync(root+'/acceptance');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{directory:'acceptance'},unitTests:{dockerfile:'unit.Dockerfile',command:'node --version',patterns:['*.test.ts']}}));
    writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));
    writeFileSync(root+'/unit.Dockerfile','FROM node:24');
    writeFileSync(root+'/.gitignore','ignored.test.ts\\n');
    for(const prefix of ['', 'acceptance/'])writeFileSync(root+'/'+prefix+'unchanged.test.ts','// unchanged');
    git('add','.');git('commit','-qm','base');git('checkout','-qb','feature');
    for(const prefix of ['', 'acceptance/']) {
      for(let i=0;i<210;i++)writeFileSync(root+'/'+prefix+'file-'+String(i).padStart(3,'0')+'.test.ts','// source '+i);
      writeFileSync(root+'/'+prefix+'oversize.test.ts','x'.repeat(200001));
      writeFileSync(root+'/'+prefix+'binary.test.ts','a'+String.fromCharCode(0)+'b');
      writeFileSync(root+'/'+prefix+'ignored.test.ts','private');
      symlinkSync('/etc/passwd',root+'/'+prefix+'escape.test.ts');
    }
    console.log(JSON.stringify(root));
  `),
  )
  const worktree = await step("프로젝트와 선택 체크아웃을 실제 서버에 연결한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(project.status).toBe(201)
    const worktree = await http<{ id: string }>(
      `/api/projects/${project.body.id}/worktrees`,
      "POST",
      { path: root },
    )
    expect(worktree.status).toBe(201)
    return worktree.body
  })
  for (const kind of ["unit", "integration"]) {
    const prefix = kind === "unit" ? "" : "acceptance/"
    const endpoint = `/api/worktrees/${worktree.id}/${kind}-tests`
    await step(`${kind} 전체·변경 목록의 소스 분리와 마지막 파일을 확인한다`, async () => {
      const all = await http<{ catalog: { files: { path: string }[]; diagnostics: string[] } }>(
        `${endpoint}?scope=all`,
      )
      const changed = await http<typeof all.body>(`${endpoint}?scope=changed`)
      expect(all.status).toBe(200)
      expect(changed.status).toBe(200)
      expect(all.body.catalog.files).toHaveLength(214)
      expect(changed.body.catalog.files).toHaveLength(213)
      expect(all.body.catalog.files).toContainEqual({ path: `${prefix}unchanged.test.ts` })
      expect(changed.body.catalog.files).not.toContainEqual({ path: `${prefix}unchanged.test.ts` })
      expect(all.body.catalog.files.every((file) => Object.keys(file).join() === "path")).toBe(true)
      const source = await http(
        `${endpoint}/source?path=${encodeURIComponent(`${prefix}file-209.test.ts`)}`,
      )
      expect(source.status).toBe(200)
      expect(source.body).toEqual({ path: `${prefix}file-209.test.ts`, source: "// source 209" })
    })
    await step(`${kind} 소스 크기·바이너리·경로 이탈·설정 범위 오류를 검증한다`, async () => {
      for (const file of ["oversize.test.ts", "binary.test.ts", "escape.test.ts"]) {
        const response = await http(`${endpoint}/source?path=${encodeURIComponent(prefix + file)}`)
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ source: null, issue: expect.any(String) })
      }
      for (const path of [
        "../outside.test.ts",
        "/etc/passwd",
        `${prefix}ignored.test.ts`,
        "unit.Dockerfile",
        "missing.test.ts",
      ]) {
        const response = await http(`${endpoint}/source?path=${encodeURIComponent(path)}`)
        expect(response.status).toBe(400)
      }
      expect((await http(`${endpoint}/source`)).status).toBe(400)
    })
  }
})
