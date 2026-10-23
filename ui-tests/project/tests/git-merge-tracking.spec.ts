import { expect, test } from "@playwright/test"
import { isOnScreen, openApp } from "../app"
import { node } from "../target"

test("PR squash 병합은 사이드바에서 숨기고 실제 커밋 이력은 Git Graph에 남긴다", async ({
  page,
  request,
}) => {
  const fixture = await node<{ root: string; cli: string; dirty: string }>(`
    import {mkdtempSync,writeFileSync,chmodSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const root=mkdtempSync('/tmp/pr-merge-browser-');
    const git=(cwd,...args)=>execFileSync('git',['-C',cwd,'-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@example.com',...args],{stdio:'pipe'}).toString().trim();
    git(root,'init','-b','main'); writeFileSync(root+'/base.txt','base'); git(root,'add','.'); git(root,'commit','-qm','Base commit');
    git(root,'remote','add','origin','https://github.com/redpact-fixture/merge-tracking.git');
    const base=git(root,'rev-parse','HEAD'); const responses={};
    for(const name of ['clean-pr','dirty-pr']) {
      const path=root+'-'+name; git(root,'worktree','add','-b',name,path,base);
      writeFileSync(path+'/'+name+'.txt',name); git(path,'add','.'); git(path,'commit','-qm','Original '+name);
      const head=git(path,'rev-parse','HEAD'); git(root,'merge','--squash',name); git(root,'commit','-qm','Viewer '+name+' (#29)');
      responses[head]=[{number:29,html_url:'https://github.com/redpact-fixture/merge-tracking/pull/29',merged_at:'2026-10-23T01:00:00Z',merge_commit_sha:git(root,'rev-parse','HEAD'),head:{ref:name,sha:head,repo:{full_name:'redpact-fixture/merge-tracking'}},base:{ref:'main',repo:{full_name:'redpact-fixture/merge-tracking'}}}];
      if(name==='dirty-pr'){writeFileSync(path+'/uncommitted.txt','keep this work')}
    }
    const cli=root+'-gh'; writeFileSync(cli,'#!/usr/bin/env node\\nconst responses='+JSON.stringify(responses)+'; const parts=process.argv.at(-1).split("/"); const head=parts[parts.indexOf("commits")+1]; console.log(JSON.stringify(responses[head]||[]));\\n'); chmodSync(cli,0o755);
    console.log(JSON.stringify({root,cli,dirty:root+'-dirty-pr'}));
  `)
  const originalResponse = await request.get("/api/instance/settings")
  const original = await originalResponse.json()
  const value = JSON.parse(original.source)
  value.github = { ...(value.github ?? {}), cliPath: fixture.cli }
  try {
    await test.step("외부 GitHub CLI만 명시적 픽스처로 연결하고 실제 프로젝트를 연다", async () => {
      const saved = await request.put("/api/instance/settings", {
        data: { source: JSON.stringify(value), revision: original.revision },
      })
      expect(saved.ok()).toBeTruthy()
      const response = await request.post("/api/projects", {
        data: { path: fixture.root, name: "PR merge fixture" },
      })
      expect(response.ok()).toBeTruthy()
      const project = await response.json()
      const tracking = await request.post(`/api/projects/${project.id}/tracking`, {
        data: { mainBranch: "main", hideMerged: true, showBranches: true },
      })
      expect(tracking.ok()).toBeTruthy()
      await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
      await openApp(page, "en")
    })
    await test.step("깨끗한 병합 워크트리는 숨기고 미커밋 작업은 보존한다", async () => {
      const graphButton = page.getByRole("button", { name: "Git Graph", exact: true })
      if (!(await isOnScreen(graphButton))) {
        await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
      }
      const worktrees = page.getByRole("navigation", { name: "Worktrees", exact: true })
      await expect(worktrees.getByRole("button", { name: "dirty-pr", exact: true })).toBeVisible()
      await expect(worktrees.getByRole("button", { name: "clean-pr", exact: true })).toHaveCount(0)
      await graphButton.click()
      await page.keyboard.press("Escape")
    })
    await test.step("Git Graph에서 squash 커밋 제목과 원본 브랜치 이력을 탐색한다", async () => {
      const graph = page.locator("web-git-graph")
      await expect(graph).toHaveAttribute("aria-busy", "false")
      await graph.getByRole("searchbox", { name: "Search commits" }).fill("Viewer clean-pr (#29)")
      await expect(graph.locator(".search-count")).toHaveText("1/1")
      await graph.getByText("Viewer clean-pr (#29)", { exact: true }).click()
      await expect(graph.locator(".row.selected")).toContainText("Viewer clean-pr (#29)")
      await expect(page.getByRole("separator", { name: "Resize commit changes" })).toBeVisible()
      await graph.getByRole("searchbox", { name: "Search commits" }).fill("Original clean-pr")
      await expect(graph.locator(".search-count")).toHaveText("1/1")
    })
  } finally {
    const current = await (await request.get("/api/instance/settings")).json()
    expect(
      (
        await request.put("/api/instance/settings", {
          data: { source: original.source, revision: current.revision },
        })
      ).ok(),
    ).toBeTruthy()
  }
})
