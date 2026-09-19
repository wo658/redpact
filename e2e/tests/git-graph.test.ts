import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

type Page = {
  commits: { oid: string; parents: string[]; message: string }[]
  refs: { name: string; target: string }[]
  hasMore: boolean
  cursor?: string
}

/** 프로젝트 전체 브랜치를 읽기 전용 그래프로 탐색하고 외부 변경을 다시 읽는다. */
test("프로젝트 Git Graph가 분기·병합·태그와 페이지를 제공하고 작업 파일을 보존한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("관리 환경 안에 분기와 병합이 있는 Git 저장소를 만든다", () =>
    node<{ root: string; feature: string; merge: string; index: string }>(`
    import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    import {createHash} from 'node:crypto';
    const root = mkdtempSync('/tmp/graph-');
    const git = (...args) => execFileSync('git', ['-C',root,...args],{encoding:'utf8'}).trim();
    git('init','-q','-b','main'); git('config','user.name','Graph'); git('config','user.email','graph@example.com');
    git('commit','--allow-empty','-qm','base'); git('checkout','-qb','feature');
    git('commit','--allow-empty','-qm','feature'); const feature=git('rev-parse','HEAD');
    git('checkout','-q','main'); git('commit','--allow-empty','-qm','main');
    git('merge','--no-ff','-qm','merge','feature'); const merge=git('rev-parse','HEAD');
    git('tag','-a','v1','-m','release'); git('update-ref','refs/remotes/origin/feature',feature);
    writeFileSync(root+'/file','staged'); git('add','.'); writeFileSync(root+'/file','working');
    const index=createHash('sha256').update(readFileSync(root+'/.git/index')).digest('hex');
    console.log(JSON.stringify({root,feature,merge,index}));
  `),
  )
  const projectId = await step("실제 API로 프로젝트를 연결한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
    expect(project.status).toBe(201)
    return project.body.id
  })
  const path = `/api/projects/${projectId}/git/graph`
  const first = await step("전체 브랜치의 첫 페이지에서 병합과 ref를 확인한다", async () => {
    const response = await http<Page>(`${path}?limit=2`)
    expect(response.status).toBe(200)
    expect(response.body.commits[0].oid).toBe(fixture.merge)
    expect(response.body.commits[0].parents).toHaveLength(2)
    expect(response.body.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "refs/heads/feature", target: fixture.feature }),
        expect.objectContaining({ name: "refs/remotes/origin/feature", target: fixture.feature }),
        expect.objectContaining({ name: "refs/tags/v1", target: fixture.merge }),
      ]),
    )
    expect(response.body.hasMore).toBe(true)
    return response.body
  })
  await step("다음 페이지와 브랜치 필터가 실제 조상 관계를 유지한다", async () => {
    const next = await http<Page>(
      `${path}?limit=2&cursor=${encodeURIComponent(first.cursor ?? "")}`,
    )
    expect(next.status).toBe(200)
    expect(new Set([...first.commits, ...next.body.commits].map((commit) => commit.oid)).size).toBe(
      4,
    )
    expect(next.body.hasMore).toBe(false)
    const selected = await http<Page>(`${path}?ref=refs%2Fheads%2Ffeature`)
    expect(selected.body.commits).toHaveLength(2)
    expect(selected.body.commits[0].oid).toBe(fixture.feature)
  })
  await step("조회가 파일과 인덱스를 바꾸지 않고 외부 커밋 후 옛 페이지를 거부한다", async () => {
    const state = await node<{ index: string; source: string }>(
      `
      import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {execFileSync} from 'node:child_process';
      const root=JSON.parse(process.argv[1]);
      const index=createHash('sha256').update(readFileSync(root+'/.git/index')).digest('hex');
      const source=readFileSync(root+'/file','utf8');
      execFileSync('git',['-C',root,'commit','-qm','external commit']);
      console.log(JSON.stringify({index,source}));
    `,
      fixture.root,
    )
    expect(state).toEqual({ index: fixture.index, source: "working" })
    expect((await http(`${path}?cursor=${encodeURIComponent(first.cursor ?? "")}`)).status).toBe(
      409,
    )
    expect((await http<Page>(path)).body.commits[0].message).toBe("external commit")
    expect((await http(path, "POST", {})).status).toBe(404)
  })
}, 60000)

/** 그래프에서 선택한 과거 커밋의 파일 변경을 작업 파일과 분리해서 조회한다. */
test("커밋 diff가 과거 변경과 최초 커밋을 반환하고 작업 파일을 보존한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("최초·수정 커밋과 미커밋 변경을 준비한다", () =>
    node<{ root: string; base: string; selected: string }>(`
    import {mkdtempSync,writeFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root=mkdtempSync('/tmp/commit-diff-');
    const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
    git('init','-q','-b','main');git('config','user.name','Graph');git('config','user.email','graph@example.com');
    writeFileSync(root+'/file.txt','before\\n');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
    writeFileSync(root+'/file.txt','after\\n');git('add','.');git('commit','-qm','selected');const selected=git('rev-parse','HEAD');
    writeFileSync(root+'/file.txt','working\\n');
    console.log(JSON.stringify({root,base,selected}));
  `),
  )
  const projectId = await step("실제 프로젝트 API에 저장소를 연결한다", async () => {
    const result = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
    expect(result.status).toBe(201)
    return result.body.id
  })
  await step("선택한 커밋의 부모 대비 변경만 읽는다", async () => {
    const result = await http<{ revision: string; baseRevision: string; patch: string }>(
      `/api/projects/${projectId}/git/commits/${fixture.selected}/diff`,
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ revision: fixture.selected, baseRevision: fixture.base })
    expect(result.body.patch).toContain("-before")
    expect(result.body.patch).toContain("+after")
    expect(result.body.patch).not.toContain("working")
  })
  await step("최초 커밋은 추가 파일로 읽고 잘못된 revision은 거부한다", async () => {
    const result = await http<{ patch: string }>(
      `/api/projects/${projectId}/git/commits/${fixture.base}/diff`,
    )
    expect(result.status).toBe(200)
    expect(result.body.patch).toContain("new file mode")
    expect((await http(`/api/projects/${projectId}/git/commits/HEAD/diff`)).status).toBe(400)
    const source = await node<string>(
      `import {readFileSync} from 'node:fs'; console.log(JSON.stringify(readFileSync(JSON.parse(process.argv[1])+'/file.txt','utf8')));`,
      fixture.root,
    )
    expect(source).toBe("working\n")
  })
}, 60000)
