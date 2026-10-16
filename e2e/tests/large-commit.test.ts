import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

test("큰 커밋 API는 제한을 명시하고 전체 파일 경로와 작은 패치를 보존한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("4MiB를 넘는 실제 커밋과 작은 부모 커밋을 만든다", () =>
    node<{ root: string; small: string; large: string }>(`
      import {mkdtempSync,writeFileSync} from 'node:fs';
      import {execFileSync} from 'node:child_process';
      const root=mkdtempSync('/tmp/large-api-');
      const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
      git('init','-q','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
      writeFileSync(root+'/small.txt','small change\\n');git('add','.');git('commit','-qm','small');const small=git('rev-parse','HEAD');
      writeFileSync(root+'/large.txt','large changed line\\n'.repeat(260000));writeFileSync(root+'/tail.txt','tail\\n');
      git('add','.');git('commit','-qm','large');console.log(JSON.stringify({root,small,large:git('rev-parse','HEAD')}));
    `),
  )
  const project = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
  expect(project.status).toBe(201)
  await step("큰 패치를 잘라 반환하지 않고 전체 파일 목록과 제한을 반환한다", async () => {
    const result = await http(`/api/projects/${project.body.id}/git/commits/${fixture.large}/diff`)
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      available: true,
      patch: "",
      patchOmitted: "size_limit",
      changedPaths: ["large.txt", "tail.txt"],
    })
  })
  await step("작은 커밋의 패치는 여전히 원문으로 반환한다", async () => {
    const result = await http<{ patch: string; patchOmitted?: string }>(
      `/api/projects/${project.body.id}/git/commits/${fixture.small}/diff`,
    )
    expect(result.status).toBe(200)
    expect(result.body.patch).toContain("+small change")
    expect(result.body.patchOmitted).toBeUndefined()
  })
})
