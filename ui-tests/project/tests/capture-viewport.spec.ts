import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { http, node } from "../target"

/** 저장된 캡처별 크기를 공개 API로 읽고 실제 앱의 Mobile 필터를 조작한다. */
test("같은 실행의 모바일과 데스크톱 캡처를 실제 크기로 분리한다", async ({ page }) => {
  test.setTimeout(60000)
  const step = test.step
  const fixture = await step("격리된 앱에 혼합 크기 캡처 기록을 준비한다", async () => {
    const project = await http<{ id: string }>("/api/projects", "POST", { path: "/app" })
    expect(project.status).toBe(201)
    const worktree = await http<{ id: string }>(
      `/api/projects/${project.body.id}/worktrees`,
      "POST",
      { path: "/app" },
    )
    expect(worktree.status).toBe(201)
    const configuration = await http<{ source: string; revision: string }>(
      `/api/projects/${project.body.id}/configuration`,
    )
    const settings = JSON.parse(configuration.body.source)
    settings.playwright.targets["worktree-captures"] = {
      scope: "worktree",
      purpose: "capture",
      testMatch: ["worktree/captures/**/*.ts"],
    }
    const saved = await http(`/api/projects/${project.body.id}/configuration`, "PUT", {
      source: JSON.stringify(settings),
      revision: configuration.body.revision,
    })
    expect(saved.status).toBe(200)
    const runId = randomUUID()
    await node(
      `
      import {mkdirSync, writeFileSync} from 'node:fs';
      import {randomUUID,createHash} from 'node:crypto';
      const {projectId, worktreeId, runId} = JSON.parse(process.argv[1]);
      const file = 'worktree/captures/viewport.spec.ts';
      mkdirSync('/app/ui-tests/worktree/captures', {recursive:true});
      writeFileSync('/app/ui-tests/'+file, 'import {test} from "@playwright/test"; test("크기별 기록", async()=>{});');
      for (const name of ['empty.spec.ts','never.spec.ts']) {
        writeFileSync('/app/ui-tests/worktree/captures/'+name, 'import {test} from "@playwright/test"; test("이미지 없는 기록", async()=>{});');
      }
      const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
      const directory='/tmp/redpact-e2e-state/playwright-runs';
      mkdirSync(directory+'/'+runId+'/after',{recursive:true});
      const artifacts=[['Container / light / 414',414],['Desktop boundary',768],['Unknown capture',null]].map(([name,width])=>{
        const id=randomUUID();writeFileSync(directory+'/'+runId+'/after/'+id,image);
        return {id,name,contentType:'image/png',bytes:image.length,sha256:createHash('sha256').update(image).digest('hex'),...(width?{viewport:{width,height:896}}:{})};
      });
      const record={version:1,id:runId,target:'worktree-captures',purpose:'capture',scope:'worktree',worktreeId,projectId,projectRoot:'/app',revision:null,
        settings:{directory:'ui-tests',targets:{'worktree-captures':{scope:'worktree',purpose:'capture',testMatch:['worktree/captures/**/*.ts']}},service:'app',port:54318,viewport:{width:1920,height:1080}},
        selection:{services:['app'],select:{}},settingsDigest:'fixture',sourceDigest:'fixture',appDigest:'fixture',createdAt:new Date().toISOString(),state:'finished',outcome:'passed',
        before:{state:'unavailable',cases:[]},after:{state:'finished',cases:[{id:'mixed',file,title:'크기별 기록',status:'passed',duration:1,errors:[],steps:[],artifacts}]}};
      record.after.cases.push({...record.after.cases[0],id:'empty',file:'worktree/captures/empty.spec.ts',artifacts:[]});
      writeFileSync(directory+'/'+runId+'.json',JSON.stringify(record));
      console.log('null');
    `,
      { projectId: project.body.id, worktreeId: worktree.body.id, runId },
    )
    const catalog = await http<{ files: { path: string; target: string }[] }>(
      `/api/worktrees/${worktree.body.id}/playwright/catalog`,
    )
    expect(catalog.body.files).toContainEqual(
      expect.objectContaining({
        path: "worktree/captures/viewport.spec.ts",
        target: "worktree-captures",
      }),
    )
    return { projectId: project.body.id, worktreeId: worktree.body.id, runId }
  })
  await step("공개 API가 실행 크기와 별도로 캡처별 크기를 보존하는지 확인한다", async () => {
    const response = await http<{
      settings: { viewport: { width: number } }
      after: { cases: { artifacts: { viewport?: { width: number } }[] }[] }
    }>(`/api/playwright-runs/${fixture.runId}`)
    expect(response.status).toBe(200)
    expect(response.body.settings.viewport.width).toBe(1920)
    expect(
      response.body.after.cases[0].artifacts.map((artifact) => artifact.viewport?.width),
    ).toEqual([414, 768, undefined])
  })
  await step("실제 Chromium에서 Mobile 토글을 켜고 꺼 캡처가 바뀌는지 확인한다", async () => {
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:language", "en")
      localStorage.setItem("redpact:project", id)
    }, fixture.projectId)
    await page.goto("/")
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
    }
    await page
      .getByRole("navigation", { name: "Worktrees", exact: true })
      .getByRole("button")
      .first()
      .click()
    await page.keyboard.press("Escape")
    await page.getByRole("tab", { name: "Playwright", exact: true }).click()
    const mobile = page.getByRole("switch", { name: "Mobile", exact: true })
    await test.step("PNG 없는 파일과 실행하지 않은 파일도 선택하고 준비 오류를 확인한다", async () => {
      await page.getByRole("treeitem", { name: "empty.spec.ts", exact: true }).click()
      await expect(
        page.getByText("No completed screenshots in this execution.", { exact: true }),
      ).toBeVisible()
      await page.getByRole("treeitem", { name: "never.spec.ts", exact: true }).click()
      // 격리 앱에는 Docker가 없으므로 실행 준비 오류를 숨기지 않는다.
      const inspection = await (
        await page.request.get(`/api/worktrees/${fixture.worktreeId}/playwright`)
      ).json()
      expect(inspection.error).toContain("spawn docker ENOENT")
      await expect(page.getByText(/spawn docker ENOENT/)).toBeVisible()
      await expect(page.getByRole("button", { name: "Run Playwright", exact: true })).toBeDisabled()
      await expect(
        page.getByText("No captures yet. Run Playwright to record the actual application.", {
          exact: true,
        }),
      ).toBeVisible()
      await expect(page.getByAltText("Desktop boundary", { exact: true })).toHaveCount(0)
      await page.getByRole("treeitem", { name: "viewport.spec.ts", exact: true }).click()
      await expect(page.getByRole("status", { name: "Playwright progress" })).toBeVisible()
      await expect(page.getByRole("status", { name: "Playwright progress" })).toContainText(
        "Finished",
      )
    })
    await test.step("Desktop에서는 768px 캡처만 표시한다", async () => {
      await expect(page.getByAltText("Desktop boundary", { exact: true })).toBeVisible()
      await expect(page.getByAltText("Container / light / 414", { exact: true })).toHaveCount(0)
      await expect(page.getByText("Viewport unavailable", { exact: false })).toBeVisible()
    })
    await test.step("Mobile에서는 414px 캡처만 표시한다", async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await mobile.click()
      await expect(page.getByAltText("Container / light / 414", { exact: true })).toBeVisible()
      await expect(page.getByAltText("Desktop boundary", { exact: true })).toHaveCount(0)
      await expect(page.getByAltText("Unknown capture", { exact: true })).toBeVisible()
    })
    await test.step("다시 Desktop으로 돌아와도 결과가 유지된다", async () => {
      await mobile.click()
      await expect(page.getByAltText("Desktop boundary", { exact: true })).toBeVisible()
      await expect(page.getByAltText("Container / light / 414", { exact: true })).toHaveCount(0)
    })
  })
})
