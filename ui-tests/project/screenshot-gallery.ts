import { randomUUID } from "node:crypto"
import { expect, type Page } from "@playwright/test"
import { http, node } from "./target"

// 격리 앱에만 기록을 준비한다. 이 fixture는 컨트롤러의 실행 증거가 아니다.
export async function openScreenshotGallery(page: Page) {
  const project = await http<{ id: string }>("/api/projects", "POST", {
    path: "/app",
    name: "Redpact",
  })
  expect(project.status).toBe(201)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    { path: "/app" },
  )
  expect(worktree.status).toBe(201)
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "ko")
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:theme", "light")
  }, project.body.id)
  await page.goto("/")
  await expect(page.getByRole("tablist", { name: "열린 작업공간", exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const light = (await page.screenshot({ animations: "disabled", scale: "css" })).toString("base64")
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  const dark = (await page.screenshot({ animations: "disabled", scale: "css" })).toString("base64")
  const runId = randomUUID()
  await node(
    `
    import {mkdirSync,writeFileSync} from 'node:fs';
    import {randomUUID,createHash} from 'node:crypto';
    const {projectId,worktreeId,runId,light,dark}=JSON.parse(process.argv[1]);
    const directory='/tmp/redpact-e2e-state/playwright-runs';
    mkdirSync(directory+'/'+runId+'/after',{recursive:true});
    const artifacts=[['작업공간 / 라이트',light],['작업공간 / 다크',dark]].map(([name,png])=>{
      const bytes=Buffer.from(png,'base64'); const id=randomUUID();
      writeFileSync(directory+'/'+runId+'/after/'+id,bytes);
      return {id,name,contentType:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    });
    const record={version:1,id:runId,target:'project-captures',purpose:'capture',scope:'project',worktreeId,projectId,projectRoot:'/app',revision:null,
      settings:{directory:'ui-tests',targets:{'project-captures':{scope:'project',purpose:'capture',testMatch:['project/captures/**/*.ts']}},service:'app',port:54320,viewport:{width:1920,height:1080}},
      selection:{services:['app'],select:{}},settingsDigest:'fixture',sourceDigest:'fixture',appDigest:'fixture',createdAt:new Date().toISOString(),state:'finished',outcome:'passed',
      before:{state:'unavailable',cases:[]},after:{state:'finished',cases:[{id:'gallery',file:'project/captures/application.spec.ts',title:'작업공간 테마',status:'passed',duration:1,errors:[],steps:[],artifacts}]}};
    writeFileSync(directory+'/'+runId+'.json',JSON.stringify(record));
    console.log('null');
  `,
    { projectId: project.body.id, worktreeId: worktree.body.id, runId, light, dark },
  )
  await page.reload()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByRole("button", { name: "사이드바 전환", exact: true }).first().click()
  }
  await page.getByRole("button", { name: "Test", exact: true }).click()
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Playwright", exact: true }).click()
  await page.getByRole("treeitem", { name: "application.spec.ts", exact: true }).click()
  return { runId }
}
