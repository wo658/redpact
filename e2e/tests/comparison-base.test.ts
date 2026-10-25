import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

/** 외부 Git 명령으로 만든 워크트리도 현재 공통 조상으로 변경을 비교한다. */
test("기준 브랜치 병합 후 Diff와 이미지 기준이 현재 공통 조상으로 전진한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("관리형 환경 안에 부모와 자식 브랜치 및 로컬 변경을 만든다", () =>
    node<{ root: string; checkout: string; base: string; creation: string }>(`
      import {execFileSync} from 'node:child_process';
      import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
      const root = mkdtempSync('/tmp/reflog-acceptance-');
      const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args], {encoding:'utf8'}).trim();
      const write = (path, text) => writeFileSync(root + '/' + path, text);
      const commit = () => {git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD')};
      git('init', '-qb', 'main'); git('config', 'user.name', 'E2E'); git('config', 'user.email', 'e2e@redpact.invalid');
      mkdirSync(root + '/.redpact');
      write('.redpact/settings.json', JSON.stringify({unitTests:{dockerfile:'unit.Dockerfile',command:'node --version', patterns:['*.test.ts']}}));
      write('unit.Dockerfile', 'FROM node:24-bookworm-slim\\n');
      write('.redpact/tracking.json', JSON.stringify({mainBranch:'main',hideMerged:false}));
      write('base.txt', 'base'); const base = commit();
      git('checkout', '-qb', 'parent');
      write('parent.test.ts', 'export const parent = true');
      write('image.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
      const creation = commit(); const checkout = root + '-child';
      git('worktree', 'add', '-qb', 'child', checkout, 'HEAD');
      writeFileSync(checkout + '/child.test.ts', 'export const child = true');
      execFileSync('git', ['-C', checkout, 'add', '.']);
      execFileSync('git', ['-C', checkout, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'child']);
      writeFileSync(checkout + '/local.txt', 'local change');
      writeFileSync(checkout + '/image.svg', '<svg xmlns="http://www.w3.org/2000/svg"> </svg>');
      console.log(JSON.stringify({root,checkout,base,creation}));
    `),
  )
  const worktreeId = await step("실제 HTTP API로 프로젝트와 자식 워크트리를 연결한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: fixture.root })
    expect(project.status).toBe(201)
    const worktree = await http<{ id: string }>(
      `/api/projects/${project.body.id}/worktrees`,
      "POST",
      { path: fixture.checkout },
    )
    expect(worktree.status).toBe(201)
    return worktree.body.id
  })
  await step("Diff가 기준 브랜치에 없는 부모·자식 커밋과 미커밋 변경을 포함한다", async () => {
    const diff = await http<{ available: boolean; baseRevision: string; patch: string }>(
      `/api/worktrees/${worktreeId}/git/diff?scope=all`,
    )
    // 생성 reflog가 있어도 설정한 기준 브랜치의 공통 조상을 사용한다.
    expect(diff.body).toMatchObject({ available: true, baseRevision: fixture.base })
    expect(diff.body.patch).toContain("parent.test.ts")
    expect(diff.body.patch).toContain("child.test.ts")
    expect(diff.body.patch).toContain("local change")
  })
  await step("이미지와 Unit Test도 동일한 분기 기준을 사용하는지 확인한다", async () => {
    const image = await http<{ baseRevision: string; before: unknown }>(
      `/api/worktrees/${worktreeId}/git/image?path=image.svg`,
    )
    expect(image.body.baseRevision).toBe(fixture.base)
    expect(image.body.before).toBeNull()
    const units = await http<{ catalog: { files: { path: string }[]; diagnostics: string[] } }>(
      `/api/worktrees/${worktreeId}/unit-tests`,
    )
    expect(units.body.catalog.diagnostics).toEqual([])
    expect(units.body.catalog.files.map((file) => file.path)).toEqual([
      "child.test.ts",
      "parent.test.ts",
    ])
  })
  await step("기준 브랜치를 전진시키고 자식 워크트리에 병합한다", async () => {
    const advanced = await node<string>(
      `
      import {execFileSync} from 'node:child_process';
      import {writeFileSync} from 'node:fs';
      const {root, checkout} = JSON.parse(process.argv[1]);
      const git = (path, ...args) => execFileSync('git', ['-C', path, '-c', 'core.hooksPath=/dev/null', ...args], {encoding:'utf8'}).trim();
      git(root, 'checkout', 'main'); git(root, 'merge', '--ff-only', 'parent');
      writeFileSync(root + '/calendar.txt', 'shared calendar');
      git(root, 'add', 'calendar.txt'); git(root, 'commit', '-qm', 'shared calendar');
      const revision = git(root, 'rev-parse', 'HEAD');
      git(checkout, 'merge', '--no-edit', 'main');
      console.log(JSON.stringify(revision));
    `,
      fixture,
    )
    const diff = await http<{ available: boolean; baseRevision: string; patch: string }>(
      `/api/worktrees/${worktreeId}/git/diff?scope=all`,
    )
    expect(diff.status).toBe(200)
    expect(diff.body).toMatchObject({ available: true, baseRevision: advanced })
    expect(diff.body.patch).not.toContain("parent.test.ts")
    expect(diff.body.patch).not.toContain("calendar.txt")
    expect(diff.body.patch).toContain("child.test.ts")
    expect(diff.body.patch).toContain("local change")
    const image = await http<{ baseRevision: string; before: unknown }>(
      `/api/worktrees/${worktreeId}/git/image?path=image.svg`,
    )
    expect(image.body.baseRevision).toBe(advanced)
    expect(image.body.before).not.toBeNull()
  })
}, 60000)
