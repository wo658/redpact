import { afterAll, beforeAll, expect, test } from "vitest"
import { createSteps } from "./steps.js"
import { http, node } from "./target.js"

type Fixture = { root: string; cli: string; paths: Record<string, string> }
type Settings = { source: string; revision: string | null }
type Branch = { name: string; merged: boolean }
let fixture: Fixture
let projectId: string
let original: Settings

beforeAll(async () => {
  fixture = await node<Fixture>(`
    import {mkdtempSync, writeFileSync, chmodSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root = mkdtempSync('/tmp/pr-merge-tracking-');
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', ...args], {stdio:'pipe'}).toString().trim();
    git(root, 'init', '-b', 'main');
    writeFileSync(root+'/base.txt', 'base'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
    git(root, 'remote', 'add', 'origin', 'https://github.com/redpact-fixture/merge-tracking.git');
    const base = git(root, 'rev-parse', 'HEAD');
    const paths = {}; const heads = {}; const commits = {};
    const names = ['squash', 'rebase', 'new-head', 'dirty', 'wrong-base', 'wrong-repo', 'not-local', 'auth-failure', 'branch-only'];
    for (const name of names) {
      const path = root+'-'+name; paths[name] = path;
      git(root, 'worktree', 'add', '-b', name, path, base);
      writeFileSync(path+'/'+name+'.txt', name); git(path, 'add', '.'); git(path, 'commit', '-qm', 'feature '+name);
      heads[name] = git(path, 'rev-parse', 'HEAD');
      // PR integration rewrites commit identities while the local feature stays unchanged.
      if (name === 'rebase') {
        git(path, 'rebase', 'main'); git(root, 'merge', '--ff-only', name);
        commits[name] = git(root, 'rev-parse', 'HEAD'); git(path, 'reset', '--hard', heads[name]);
      } else {
        git(root, 'merge', '--squash', name); git(root, 'commit', '-qm', name+' (#'+(names.indexOf(name)+1)+')');
        commits[name] = git(root, 'rev-parse', 'HEAD');
      }
    }
    writeFileSync(paths['new-head']+'/later.txt', 'later'); git(paths['new-head'], 'add', '.'); git(paths['new-head'], 'commit', '-qm', 'after PR merge');
    writeFileSync(paths.dirty+'/uncommitted.txt', 'preserve work');
    const responses = {};
    for (const name of names) {
      const head = git(paths[name], 'rev-parse', 'HEAD');
      responses[head] = name === 'auth-failure' ? null : [{
        number:names.indexOf(name)+1,
        html_url:'https://github.com/redpact-fixture/merge-tracking/pull/'+(names.indexOf(name)+1),
        merged_at:'2026-10-23T01:00:00Z',
        merge_commit_sha:name === 'not-local' ? heads[name] : commits[name],
        head:{ref:name, sha:heads[name], repo:{full_name:name === 'wrong-repo' ? 'another/merge-tracking' : 'redpact-fixture/merge-tracking'}},
        base:{ref:name === 'wrong-base' ? 'release' : 'main', repo:{full_name:'redpact-fixture/merge-tracking'}}
      }];
    }
    git(root, 'worktree', 'remove', paths['branch-only']);
    // Only the external GitHub CLI is simulated; application HTTP and Git remain real.
    const cli = root+'-gh';
    const source = '#!/usr/bin/env node\\n'+
      'const responses='+JSON.stringify(responses)+';\\n'+
      'const parts=process.argv.at(-1).split("/"); const head=parts[parts.indexOf("commits")+1];\\n'+
      'const result=responses[head]; if(!result){console.error("fixture GitHub authentication unavailable");process.exit(1)} console.log(JSON.stringify(result));\\n';
    writeFileSync(cli, source); chmodSync(cli, 0o755);
    console.log(JSON.stringify({root, cli, paths}));
  `)
  original = (await http<Settings>("/api/instance/settings")).body
  const value = JSON.parse(original.source)
  value.github = { ...(value.github ?? {}), cliPath: fixture.cli }
  expect(
    (
      await http("/api/instance/settings", "PUT", {
        source: JSON.stringify(value),
        revision: original.revision,
      })
    ).status,
  ).toBe(200)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
  expect(project.status).toBe(201)
  projectId = project.body.id
  expect(
    (
      await http(`/api/projects/${projectId}/tracking`, "POST", {
        mainBranch: "main",
        hideMerged: true,
        showBranches: true,
      })
    ).status,
  ).toBe(200)
}, 60000)

afterAll(async () => {
  if (original) {
    const current = await http<Settings>("/api/instance/settings")
    expect(
      (
        await http("/api/instance/settings", "PUT", {
          source: original.source,
          revision: current.body.revision,
        })
      ).status,
    ).toBe(200)
  }
})

for (const [branch, hidden, reason] of [
  ["squash", true, "squash PR 병합"],
  ["rebase", true, "rebase PR 병합"],
  ["new-head", false, "PR 병합 이후 추가 커밋"],
  ["dirty", false, "PR 병합 이후 미커밋 파일"],
  ["wrong-base", false, "다른 대상 브랜치의 PR"],
  ["wrong-repo", false, "다른 저장소의 PR"],
  ["not-local", false, "로컬 main에 없는 병합 커밋"],
  ["auth-failure", false, "GitHub 인증 조회 실패"],
] as const) {
  test(`${reason}의 워크트리 보존과 브랜치 HEAD 병합 여부를 구분한다`, async (context) => {
    const step = createSteps(context)
    await step("실제 Git 체크아웃의 워크트리 표시를 확인한다", async () => {
      const response = await http<{ checkoutRoot: string }[]>(
        `/api/projects/${projectId}/worktrees`,
      )
      expect(response.status).toBe(200)
      expect(response.body.some((item) => item.checkoutRoot === fixture.paths[branch])).toBe(
        !hidden,
      )
    })
    await step(
      "실제 폴더가 있는 브랜치 카탈로그는 유지하고 커밋 병합 여부를 표시한다",
      async () => {
        const response = await http<Branch[]>(`/api/projects/${projectId}/branch-reviews`)
        expect(response.status).toBe(200)
        expect(response.body.find((item) => item.name === branch)?.merged).toBe(
          hidden || branch === "dirty",
        )
      },
    )
  }, 30000)
}

test("폴더가 없는 병합 브랜치는 숨기고 모두 표시하면 병합 상태를 보존한다", async (context) => {
  const step = createSteps(context)
  await step("삭제된 폴더의 병합 브랜치는 숨김 설정을 따른다", async () => {
    const response = await http<Branch[]>(`/api/projects/${projectId}/branch-reviews`)
    expect(response.status).toBe(200)
    expect(response.body.some((item) => item.name === "branch-only")).toBe(false)
  })
  try {
    await step("병합 숨김을 해제하면 PR 병합 근거가 브랜치 상태로 나타난다", async () => {
      expect(
        (
          await http(`/api/projects/${projectId}/tracking`, "POST", {
            mainBranch: "main",
            hideMerged: false,
            showBranches: true,
          })
        ).status,
      ).toBe(200)
      const response = await http<Branch[]>(`/api/projects/${projectId}/branch-reviews`)
      expect(response.body.find((item) => item.name === "branch-only")).toMatchObject({
        merged: true,
      })
    })
  } finally {
    expect(
      (
        await http(`/api/projects/${projectId}/tracking`, "POST", {
          mainBranch: "main",
          hideMerged: true,
          showBranches: true,
        })
      ).status,
    ).toBe(200)
  }
}, 30000)
