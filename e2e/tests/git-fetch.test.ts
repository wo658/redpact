import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

/** Fetch로 원격 ref만 갱신하고 작업 중인 변경은 보존한다. */
test("Fetch가 새 원격 커밋을 그래프에 반영하고 로컬 변경을 보존한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("원격 저장소와 미커밋 변경을 준비한다", () =>
    node<{ root: string; head: string; next: string; index: string }>(`
    import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const base=mkdtempSync('/tmp/fetch-'); const root=base+'/work'; const remote=base+'/remote';
    const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
    execFileSync('git',['init','-q','-b','main',remote]);
    git(remote,'config','user.name','Test');git(remote,'config','user.email','test@example.com');
    git(remote,'commit','--allow-empty','-qm','base');
    execFileSync('git',['clone','-q',remote,root]);const head=git(root,'rev-parse','HEAD');
    git(remote,'commit','--allow-empty','-qm','remote update');const next=git(remote,'rev-parse','HEAD');
    writeFileSync(root+'/dirty.txt','staged');git(root,'add','.');writeFileSync(root+'/dirty.txt','working');
    console.log(JSON.stringify({root,head,next,index:readFileSync(root+'/.git/index').toString('base64')}));
  `),
  )
  const project = await step("실제 API로 저장소를 연결하고 Fetch를 실행한다", async () => {
    const connected = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
    expect(connected.status).toBe(201)
    const fetched = await http(`/api/projects/${connected.body.id}/git/fetch`, "POST", {})
    expect(fetched.status).toBe(200)
    expect(fetched.body).toEqual({ remotes: ["origin"] })
    return connected.body.id
  })
  await step("갱신된 ref와 변경되지 않은 HEAD·index·작업 파일을 확인한다", async () => {
    const graph = await http<{ refs: unknown[]; commits: { oid: string }[] }>(
      `/api/projects/${project}/git/graph`,
    )
    expect(graph.body.refs).toContainEqual(
      expect.objectContaining({ name: "refs/remotes/origin/main", target: fixture.next }),
    )
    expect(graph.body.commits).toContainEqual(expect.objectContaining({ oid: fixture.next }))
    const state = await node<{ head: string; index: string; source: string }>(
      `
      import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
      const root=JSON.parse(process.argv[1]);
      console.log(JSON.stringify({head:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),index:readFileSync(root+'/.git/index').toString('base64'),source:readFileSync(root+'/dirty.txt','utf8')}));
    `,
      fixture.root,
    )
    expect(state).toEqual({ head: fixture.head, index: fixture.index, source: "working" })
  })
  await step("연결 실패와 원격 미설정을 성공으로 표시하지 않는다", async () => {
    await node(
      `import {execFileSync} from 'node:child_process';const root=JSON.parse(process.argv[1]);execFileSync('git',['-C',root,'remote','set-url','origin','/missing/redpact-remote']);console.log('null');`,
      fixture.root,
    )
    expect((await http(`/api/projects/${project}/git/fetch`, "POST", {})).status).toBe(502)
    await node(
      `import {execFileSync} from 'node:child_process';const root=JSON.parse(process.argv[1]);execFileSync('git',['-C',root,'remote','remove','origin']);console.log('null');`,
      fixture.root,
    )
    const missing = await http(`/api/projects/${project}/git/fetch`, "POST", {})
    expect(missing.status).toBe(400)
    expect(missing.body.error).toBe("No Git remotes configured")
  })
}, 60000)
