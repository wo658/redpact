import { expect, type Page } from "@playwright/test"
import { http, node } from "./target"
export async function openExecutionScope(page: Page) {
  const path = await node<string>(`
 import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
 const root=mkdtempSync('/tmp/scope-ui-');const git=(...args)=>execFileSync('git',['-C',root,...args]);git('init','-qb','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
 mkdirSync(root+'/.redpact');mkdirSync(root+'/unit');writeFileSync(root+'/Dockerfile','FROM node:24\\nWORKDIR /workspace\\nCOPY . .\\n');
 writeFileSync(root+'/.redpact/settings.json',JSON.stringify({unitTests:{dockerfile:'Dockerfile',command:'pnpm test',patterns:['unit/*.test.ts'],fileCommand:{executable:'pnpm',args:['exec','vitest','run']}}}));
 writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));for(const name of ['a','b'])writeFileSync(root+'/unit/'+name+'.test.ts','export const original=true;\\n');git('add','.');git('commit','-qm','baseline');git('checkout','-qb','feature');writeFileSync(root+'/unit/a.test.ts','export const changed=true;\\n');console.log(JSON.stringify(root));`)
  const project = await http<{ id: string }>("/api/projects", "POST", { path })
  expect(project.status).toBe(201)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    { path },
  )
  expect(worktree.status).toBe(201)
  const run = await http<{ id: string }>(
    `/api/worktrees/${worktree.body.id}/unit-tests/run`,
    "POST",
    { executionScope: "changed" },
  )
  expect(run.status).toBe(200)
  await expect
    .poll(async () => (await http<{ state: string }>(`/api/unit-runs/${run.body.id}`)).body.state, {
      timeout: 15000,
    })
    .toBe("finished")
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "en")
    localStorage.setItem("redpact:project", id)
  }, project.body.id)
  await page.goto(
    `/?project=${project.body.id}&page=review&kind=unit&id=${run.body.id}&worktree=${worktree.body.id}`,
  )
  const scope = page.getByRole("region", { name: "Execution scope", exact: true })
  await expect(scope).toBeVisible()
  await scope.getByText("Selected files (1)", { exact: true }).click()
  return { scope, path, projectId: project.body.id, worktreeId: worktree.body.id }
}
