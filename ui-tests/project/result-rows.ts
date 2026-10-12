import { randomUUID } from "node:crypto"
import { expect, type Page, test } from "@playwright/test"
import { http, node } from "./target"

// diagnostic.txt의 기록된 진단을 담은 ZIP이며 다운로드한 원본 바이트를 검증한다.
const diagnosticArchive =
  "UEsDBBQAAAAAAAAAIVwy7O8+HgAAAB4AAAAOAAAAZGlhZ25vc3RpYy50eHRyZWNvcmRlZCBkaWFnbm9zdGljIGF0dGFjaG1lbnRQSwECFAMUAAAAAAAAACFcMuzvPh4AAAAeAAAADgAAAAAAAAAAAAAAgAEAAAAAZGlhZ25vc3RpYy50eHRQSwUGAAAAAAEAAQA8AAAASgAAAAAA"

// 격리된 앱에 과거 기록을 준비한다. 이 fixture는 컨트롤러의 제출 증거를 대체하지 않는다.
async function recordedFixture(page: Page) {
  const project = await http<{ id: string }>("/api/projects", "POST", { path: "/app" })
  expect(project.status).toBe(201)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    { path: "/app" },
  )
  expect(worktree.status).toBe(201)
  const unitId = randomUUID(),
    integrationId = randomUUID(),
    captureId = randomUUID()
  const file = `recorded-${integrationId}.test.ts`
  const source =
    'import { test, expect } from "vitest";\ntest("저장된 제출의 검증 의도", () => expect("original").toBe("original"));\n'
  await node(
    `import {writeFileSync} from 'node:fs'; const {file,source}=JSON.parse(process.argv[1]); writeFileSync('/app/e2e/tests/'+file,source); console.log('null');`,
    { file, source },
  )
  const work = await http<{ id: string }>("/api/work-items", "POST", {
    worktreeId: worktree.body.id,
    intent: "저장된 제출의 검증 의도",
  })
  expect(work.status).toBe(201)
  const submission = await http<{ id: string }>(
    `/api/work-items/${work.body.id}/submissions`,
    "POST",
    { files: [{ path: file, source }] },
  )
  expect(submission.status).toBe(201)
  await page.goto("/")
  await expect(page.getByRole("tablist", { name: "Open workspaces", exact: true })).toBeVisible()
  const viewport = page.viewportSize()!
  const pictures = []
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    pictures.push({
      width,
      image: (await page.screenshot({ animations: "disabled", scale: "css" })).toString("base64"),
    })
  }
  await page.setViewportSize(viewport)
  await node(
    `
    import {mkdirSync,writeFileSync} from 'node:fs';
    import {randomUUID,createHash} from 'node:crypto';
    import {snapshotInputs} from '/app/app/server/dist/adapters/environment/inputs.js';
    const {projectId,worktreeId,submissionId,unitId,integrationId,captureId,file,source,pictures,diagnosticArchive}=JSON.parse(process.argv[1]);
    const root='/tmp/redpact-e2e-state',time=new Date().toISOString();
    mkdirSync(root+'/unit-runs',{recursive:true});
    writeFileSync(root+'/unit-runs/'+unitId+'.json',JSON.stringify({version:2,id:unitId,worktreeId,projectId,projectRoot:'/app',settings:{dockerfile:'unit.Dockerfile',cwd:'.',command:'node --version',patterns:['e2e/tests/'+file]},runtimeId:null,containerId:null,imageId:null,inputDigest:'captured',cleanup:{state:'removed',error:null},createdAt:time,finishedAt:time,state:'finished',outcome:'execution_error',exitCode:1,stdout:'첫 번째 출력\\n두 번째 출력',stderr:'기록된 Unit 진단',truncated:false,error:'Docker unavailable'}));
    mkdirSync(root+'/runs/'+integrationId,{recursive:true});
    writeFileSync(root+'/runs/'+integrationId+'/state.json',JSON.stringify({version:1,data:{id:integrationId,submissionId,target:{projectId,worktreeId,projectRoot:'/app',checkoutRoot:'/app'},state:'finished',result:{outcome:'assertion_failed',cases:[{file,name:'저장된 제출의 검증 의도',state:'failed',errors:[{name:'AssertionError',message:'기록된 단언 실패'}],steps:[{id:'step-one',name:'입력과 응답을 확인한다',state:'failed',startedAt:0,durationMs:15}]}],errors:[]},createdAt:time,finishedAt:time,limitations:[]}}));
    writeFileSync(root+'/runs/'+integrationId+'/stdout.log','Integration 기록 출력\\n원문 줄바꿈 유지');
    const dir=root+'/playwright-runs/'+captureId;
    mkdirSync(dir+'/sources/project/tests',{recursive:true});mkdirSync(dir+'/after',{recursive:true});
    const captureFile='project/tests/recorded.spec.ts';
    writeFileSync(dir+'/sources/'+captureFile,'// recorded browser source\\nexport const original = true;\\n');
    const artifacts=pictures.map(({width,image})=>{const bytes=Buffer.from(image,'base64'),id=randomUUID();writeFileSync(dir+'/after/'+id,bytes);return {id,name:'Recorded viewer '+width,contentType:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),viewport:{width,height:900}}});
    const attachment=Buffer.from(diagnosticArchive,'base64'),attachmentId=randomUUID();writeFileSync(dir+'/after/'+attachmentId,attachment);artifacts.push({id:attachmentId,name:'diagnostic.zip',contentType:'application/zip',bytes:attachment.length,sha256:createHash('sha256').update(attachment).digest('hex')});
    writeFileSync(root+'/playwright-runs/'+captureId+'.json',JSON.stringify({version:1,id:captureId,target:'project-tests',purpose:'functional',scope:'project',worktreeId,projectId,projectRoot:'/app',revision:null,settings:{directory:'ui-tests',targets:{'project-tests':{purpose:'functional',testMatch:['project/tests/**/*.ts']}},service:'app',port:54320,viewport:{width:1280,height:900}},selection:{services:['app'],select:{}},settingsDigest:'fixture',sourceDigest:await snapshotInputs(dir+'/sources'),appDigest:'fixture',createdAt:time,finishedAt:time,state:'finished',outcome:'failed',before:{state:'unavailable',cases:[]},after:{state:'finished',cases:[{id:'recorded',file:captureFile,title:'긴 실행 결과 제목은 화면 너비에 맞게 자연스럽게 여러 줄로 읽을 수 있어야 합니다',status:'failed',duration:125,errors:['기록된 브라우저 실패'],steps:[{title:'응답을 확인한다',duration:125,error:'기록된 단계 진단'}],artifacts}]}}));
    writeFileSync('/app/e2e/tests/'+file,'// current source changed after submission');
    console.log('null');
  `,
    {
      projectId: project.body.id,
      worktreeId: worktree.body.id,
      submissionId: submission.body.id,
      unitId,
      integrationId,
      captureId,
      file,
      source,
      pictures,
      diagnosticArchive,
    },
  )
  // 화면 검증 전에 저장소가 실제 기록을 읽을 수 있는지 확인한다.
  for (const [kind, id] of [
    ["unit", unitId],
    ["integration", integrationId],
    ["playwright", captureId],
  ]) {
    const recorded = await http<{ executionId: string }>(
      `/api/review-context?kind=${kind}&id=${id}`,
    )
    expect(recorded.status, `${kind} 기록이 공개 검토 API에서 유효해야 한다`).toBe(200)
    expect(recorded.body.executionId).toBe(id)
  }
  return { unitId, integrationId, captureId, worktreeId: worktree.body.id, source }
}

export function registerResultRowTests(capture = false) {
  test.use({
    channel: "chromium",
    launchOptions: {
      args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
    },
  })
  for (const width of [1280, 390]) {
    test(`${width}px 실행 원문·로그·스크린샷과 이력의 정확한 기록을 검토한다`, async ({
      page,
    }, info) => {
      await page.addInitScript(() => localStorage.setItem("redpact:language", "en"))
      await page.setViewportSize({ width, height: 900 })
      const fixture = await recordedFixture(page)
      const review = (kind: string, id: string) => `/?page=review&kind=${kind}&id=${id}`
      async function screenshot(label: string) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
        if (capture) {
          await page.evaluate(() => document.fonts.ready)
          await info.attach(`${width}px / ${label}`, {
            body: await page.screenshot({ animations: "disabled", scale: "css" }),
            contentType: "image/png",
          })
        }
      }
      await test.step("Unit의 종료 단계와 stdout·stderr 및 오류를 함께 읽는다", async () => {
        await page.goto(review("unit", fixture.unitId))
        await expect(page.getByRole("status", { name: "Unit progress" })).toContainText("Finished")
        await expect(page.getByRole("region", { name: "stdout" })).toContainText(
          "첫 번째 출력\n두 번째 출력",
        )
        await expect(page.getByRole("region", { name: "stderr" })).toContainText("기록된 Unit 진단")
        await expect(page.getByText("Exit code: 1", { exact: true })).toBeVisible()
        await expect(page.getByText("Docker unavailable", { exact: true })).toBeVisible()
        await screenshot("Unit 기록")
      })
      await test.step("Integration은 현재 파일이 바뀌어도 제출한 원문과 관찰 결과를 보존한다", async () => {
        await page.goto(review("integration", fixture.integrationId))
        await expect(page.getByRole("status", { name: "Integration progress" })).toContainText(
          "Finished",
        )
        await expect(page.getByText("입력과 응답을 확인한다", { exact: true })).toBeVisible()
        await expect(page.getByRole("region", { name: "stdout" })).toContainText(
          "Integration 기록 출력\n원문 줄바꿈 유지",
        )
        await screenshot("Integration 결과")
        await page.getByRole("tab", { name: "Executed source", exact: true }).click()
        const source = page.getByRole("tabpanel", { name: "Executed source", exact: true })
        await expect(source).toContainText('expect("original").toBe("original")')
        await expect(source).not.toContainText("current source changed")
        await expect(source.locator(".token").first()).toBeVisible()
        await expect(source.locator(".diff-gutter").last()).toBeVisible()
        await screenshot("Integration 제출 원문")
      })
      await test.step("Playwright는 동일 실행의 모든 화면 크기와 원문·첨부물을 읽는다", async () => {
        await page.goto(review("playwright", fixture.captureId))
        await expect(page.getByRole("status", { name: "Playwright progress" })).toContainText(
          "Finished",
        )
        await expect(
          page.getByText("응답을 확인한다 · 기록된 단계 진단", { exact: true }),
        ).toBeVisible()
        for (const imageWidth of [1280, 390]) {
          const image = page.getByRole("img", {
            name: `Recorded viewer ${imageWidth}`,
            exact: true,
          })
          await expect(image).toBeVisible()
          await expect
            .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
            .toBe(imageWidth)
        }
        await expect(page.getByRole("heading", { name: "Before", exact: true })).toHaveCount(0)
        const attachment = page.getByRole("link", { name: "diagnostic.zip" })
        const response = await page.request.get((await attachment.getAttribute("href"))!)
        expect(response.headers()["content-type"]).toContain("application/zip")
        expect(await response.body()).toEqual(Buffer.from(diagnosticArchive, "base64"))
        await screenshot("Playwright 기록 이미지")
        await page
          .getByRole("button", { name: "Executed source: project/tests/recorded.spec.ts" })
          .click()
        await expect(page.locator(".diff-source")).toContainText("export const original = true;")
        await screenshot("Playwright 실행 원문")
      })
      await test.step("기록 링크와 브라우저 방문 기록은 같은 실행을 다시 연다", async () => {
        await page.getByRole("link", { name: "Execution history", exact: true }).click()
        await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible()
        expect(new URL(page.url()).searchParams.get("worktree")).toBe(fixture.worktreeId)
        const row = page
          .locator("li")
          .filter({ has: page.locator(`a[href*="id=${fixture.unitId}"]`) })
        await expect(row).toBeVisible()
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
          origin: new URL(page.url()).origin,
        })
        await row.getByRole("button", { name: /Copy log:/ }).click()
        await expect(row.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
        expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("첫 번째 출력")
        await screenshot("실행 이력")
        await row.getByRole("link", { name: "Review", exact: true }).click()
        await expect(page.getByRole("region", { name: "stdout" })).toContainText("두 번째 출력")
        await page.goBack()
        await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible()
        await page.goForward()
        await page.reload()
        await expect(page.getByText(fixture.unitId, { exact: true })).toBeVisible()
        await expect(page.getByRole("region", { name: "stdout" })).toContainText("두 번째 출력")
      })
    })
  }
}
