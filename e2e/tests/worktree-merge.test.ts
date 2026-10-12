import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

type Inspection = {
  source: {
    revision: string
    dirty: boolean
    files: { path: string; staged: boolean; unstaged: boolean; untracked: boolean }[]
  }
  target: { revision: string }
  blockedReason: string | null
  records: { id: string; state: string }[]
}
async function fixture() {
  const root = await node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,writeFileSync} from 'node:fs';
    const root = mkdtempSync('/tmp/redpact-merge-e2e-');
    const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{stdio:'pipe'});
    git(root,'init','-qb','main'); git(root,'config','user.email','e2e@example.com'); git(root,'config','user.name','E2E');
    writeFileSync(root+'/.gitignore','.redpact/\\nignored\\n'); writeFileSync(root+'/file.txt','base\\n');
    git(root,'add','.'); git(root,'commit','-qm','base'); git(root,'worktree','add','-qb','feature',root+'-feature');
    console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  const tracking = await http(`/api/projects/${project.body.id}/tracking`, "POST", {
    mainBranch: "main",
    hideMerged: false,
  })
  expect(tracking.status).toBe(200)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    { path: `${root}-feature` },
  )
  expect(worktree.status).toBe(201)
  return { root, id: worktree.body.id }
}
async function write(root: string, file: string, content: string, commit = false) {
  return node(
    `
    import {writeFileSync} from 'node:fs'; import {execFileSync} from 'node:child_process';
    const {root,file,content,commit}=JSON.parse(process.argv[1]); writeFileSync(root+'/'+file,content);
    if(commit){execFileSync('git',['-C',root,'add','.']); execFileSync('git',['-C',root,'commit','-qm','change']);}
    console.log('null');
  `,
    { root, file, content, commit },
  )
}
async function inspect(id: string) {
  const result = await http<Inspection>(`/api/worktrees/${id}/merge`)
  expect(result.status).toBe(200)
  return result.body
}
async function merge(id: string, state: Inspection) {
  return http<{ id: string; state: string; resolutionRequest: string; conflicts: string[] }>(
    `/api/worktrees/${id}/merge`,
    "POST",
    {
      requestId: crypto.randomUUID(),
      sourceRevision: state.source.revision,
      targetRevision: state.target.revision,
    },
  )
}

/** 미커밋 변경을 명시적으로 정리한 후에만 독립적인 머지를 허용한다. */
test("미커밋 변경 확인·오래된 요청 거절·커밋 후 머지와 이력을 확인한다", async (context) => {
  const step = createSteps(context)
  const { root, id } = await step("독립적인 Git 작업 fixture를 연결한다", fixture)
  await step("작업 branch에 새 파일을 만든다", () => write(`${root}-feature`, "new.txt", "first\n"))
  const dirty = await step("미커밋 목록과 머지 차단을 확인한다", async () => {
    const state = await inspect(id)
    expect(state.source.files).toContainEqual({
      path: "new.txt",
      staged: false,
      unstaged: false,
      untracked: true,
    })
    expect((await merge(id, state)).status).toBe(409)
    return state
  })
  await step("확인 이후 수정된 내용을 오래된 버리기 요청으로 삭제하지 않는다", async () => {
    await write(`${root}-feature`, "new.txt", "later\n")
    const result = await http(`/api/worktrees/${id}/git/discard`, "POST", {
      revision: dirty.source.revision,
    })
    expect(result.status).toBe(409)
  })
  await step("최신 변경을 커밋하고 깨끗한 상태를 확인한다", async () => {
    const state = await inspect(id)
    expect(
      (
        await http(`/api/worktrees/${id}/git/commit`, "POST", {
          revision: state.source.revision,
          message: "Save feature",
        })
      ).status,
    ).toBe(200)
    expect((await inspect(id)).source.dirty).toBe(false)
  })
  await step("머지 결과와 대상 파일 및 이력을 확인한다", async () => {
    const result = await merge(id, await inspect(id))
    expect(result.body.state).toBe("merged")
    expect((await inspect(id)).records).toContainEqual(
      expect.objectContaining({ id: result.body.id, state: "merged" }),
    )
    const content = await node<string>(
      `import {readFileSync} from 'node:fs';console.log(JSON.stringify(readFileSync(JSON.parse(process.argv[1])+'/new.txt','utf8')));`,
      root,
    )
    expect(content).toBe("later\n")
  })
}, 60000)

/** 충돌 해결을 AI 세션에 인계할 때 브랜치와 실패 맥락을 보존한다. */
test("머지 충돌은 대상 변경 없이 기록하고 해결 요청을 제공한다", async (context) => {
  const step = createSteps(context)
  const { root, id } = await step("충돌 검증용 Git 작업 fixture를 연결한다", fixture)
  await step("양쪽 branch에서 같은 줄을 다르게 수정한다", async () => {
    await write(root, "file.txt", "main\n", true)
    await write(`${root}-feature`, "file.txt", "feature\n", true)
  })
  await step("충돌 결과와 해결 요청에 원래 경로가 포함되는지 확인한다", async () => {
    const result = await merge(id, await inspect(id))
    expect(result.body.state).toBe("conflict")
    expect(result.body.conflicts).toEqual(["file.txt"])
    expect(result.body.resolutionRequest).toContain(`${root}-feature`)
    const contents = await node<string[]>(
      `import {readFileSync} from 'node:fs';const root=JSON.parse(process.argv[1]);console.log(JSON.stringify([readFileSync(root+'/file.txt','utf8'),readFileSync(root+'-feature/file.txt','utf8')]));`,
      root,
    )
    expect(contents).toEqual(["main\n", "feature\n"])
    expect((await inspect(id)).source.dirty).toBe(false)
  })
}, 60000)
