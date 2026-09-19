import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

test("폴더가 사라져도 브랜치를 탐색하고 표시 설정과 커밋 Diff를 보존한다", async (context) => {
  const step = createSteps(context)
  const root = await step("독립 Git 프로젝트와 브랜치 및 사라진 작업 폴더 준비", () =>
    node<string>(`
    import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root = mkdtempSync('/tmp/branch-navigation-');
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {stdio:'pipe'}).toString().trim();
    git('init','-b','main'); writeFileSync(root+'/base.txt','base'); git('add','.'); git('commit','-qm','base');
    git('branch','merged'); git('checkout','-b','feature'); writeFileSync(root+'/feature.txt','committed feature'); git('add','.'); git('commit','-qm','feature'); git('checkout','main');
    git('worktree','add','-b','missing',root+'-missing','feature'); rmSync(root+'-missing',{recursive:true});
    writeFileSync(root+'/dirty.txt','primary-only uncommitted');
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("실제 Redpact HTTP로 프로젝트 연결", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(response.status).toBe(201)
    return response.body
  })
  await step("기본은 워크트리만 표시하며 브랜치 포함 설정을 저장", async () => {
    const initial = await http<{ tracking: { showBranches?: boolean } }>(
      `/api/projects/${project.id}/tracking`,
    )
    expect(initial.body.tracking.showBranches ?? false).toBe(false)
    const saved = await http(`/api/projects/${project.id}/tracking`, "POST", {
      mainBranch: "main",
      hideMerged: true,
      showBranches: true,
    })
    expect(saved.status).toBe(200)
    const read = await http<{ tracking: { showBranches: boolean; hideMerged: boolean } }>(
      `/api/projects/${project.id}/tracking`,
    )
    expect(read.body.tracking).toMatchObject({ showBranches: true, hideMerged: true })
  })
  await step("병합 브랜치는 숨기고 사라진 폴더의 브랜치는 유지", async () => {
    const response = await http<{ name: string; worktrees: { missing: boolean }[] }[]>(
      `/api/projects/${project.id}/branch-reviews`,
    )
    expect(response.status).toBe(200)
    expect(response.body.map((row) => row.name)).toContain("feature")
    expect(response.body.map((row) => row.name)).not.toContain("merged")
    expect(response.body.find((row) => row.name === "missing")?.worktrees[0].missing).toBe(true)
  })
  await step("기본 작업 파일을 건드리지 않고 커밋된 변경만 조회", async () => {
    const response = await http<{ patch: string }>(
      `/api/projects/${project.id}/branch-diff?branch=feature`,
    )
    expect(response.status).toBe(200)
    expect(response.body.patch).toContain("+committed feature")
    expect(response.body.patch).not.toContain("primary-only uncommitted")
    expect((await http(`/api/projects/${project.id}/branch-diff?branch=HEAD`)).status).toBe(404)
  })
  await step("모두 표시로 바꾸면 병합 브랜치도 다시 표시", async () => {
    expect(
      (
        await http(`/api/projects/${project.id}/tracking`, "POST", {
          mainBranch: "main",
          hideMerged: false,
          showBranches: true,
        })
      ).status,
    ).toBe(200)
    const response = await http<{ name: string }[]>(`/api/projects/${project.id}/branch-reviews`)
    expect(response.body.map((row) => row.name)).toContain("merged")
  })
}, 60000)
