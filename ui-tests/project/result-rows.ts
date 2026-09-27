import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { http, node } from "./target"

/** 저장된 Unit·Integration 실행이 실제 프로젝트 테스트 화면에서 같은 진행 상태 형식을 사용한다. */
export function registerResultRowTests(capture = false) {
  test.use({
    channel: "chromium",
    launchOptions: {
      args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
    },
  })
  for (const width of [1280, 390]) {
    test(`결과 행 데스크톱과 모바일 ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      const project = await test.step("격리된 앱에 프로젝트와 워크트리를 연결한다", async () => {
        const connected = await http<{ id: string }>("/api/projects", "POST", { path: "/app" })
        expect(connected.status).toBe(201)
        const worktree = await http<{ id: string }>(
          `/api/projects/${connected.body.id}/worktrees`,
          "POST",
          { path: "/app" },
        )
        expect(worktree.status).toBe(201)
        return { id: connected.body.id, worktreeId: worktree.body.id }
      })
      const source =
        'import { test, expect } from "vitest"; test("진행 상태", () => expect(true).toBe(true));'
      await test.step("공개 API로 제출을 만들고 격리된 실행 기록을 준비한다", async () => {
        await node(
          `
      import {writeFileSync} from 'node:fs';
      writeFileSync('/app/e2e/tests/progress.test.ts', JSON.parse(process.argv[1]).source);
      console.log('null');
    `,
          { source },
        )
        const work = await http<{ id: string }>("/api/work-items", "POST", {
          worktreeId: project.worktreeId,
          intent: "실행 진행 상태 검토",
        })
        expect(work.status, JSON.stringify(work.body)).toBe(201)
        const submission = await http<{ id: string }>(
          `/api/work-items/${work.body.id}/submissions`,
          "POST",
          { files: [{ path: "progress.test.ts", source }] },
        )
        expect(submission.status, JSON.stringify(submission.body)).toBe(201)
        await node(
          `
      import {mkdirSync,writeFileSync} from 'node:fs';
      const {projectId,worktreeId,submissionId,unitId,integrationId} = JSON.parse(process.argv[1]);
      const root='/tmp/redpact-e2e-state'; const time=new Date().toISOString();
      mkdirSync(root+'/unit-runs',{recursive:true});
      const unit={version:2,id:unitId,worktreeId,projectId,projectRoot:'/app',
        settings:{dockerfile:'unit.Dockerfile',cwd:'.',command:'node --version',patterns:['e2e/tests/progress.test.ts']},
        runtimeId:null,containerId:null,imageId:null,inputDigest:'captured',
        cleanup:{state:'removed',error:null},createdAt:time,finishedAt:time,state:'finished',
        outcome:'execution_error',exitCode:1,stdout:'첫 번째 출력\\n두 번째 출력',stderr:'진단 메시지',truncated:false,error:'Docker unavailable'};
      writeFileSync(root+'/unit-runs/'+unitId+'.json',JSON.stringify(unit));
      mkdirSync(root+'/runs/'+integrationId,{recursive:true});
      const integration={id:integrationId,submissionId,target:{projectId,worktreeId,projectRoot:'/app',checkoutRoot:'/app'},
        state:'finished',result:{outcome:'environment_error',cases:[],errors:['Docker unavailable']},
        createdAt:time,finishedAt:time,limitations:[]};
      writeFileSync(root+'/runs/'+integrationId+'/state.json',JSON.stringify({version:1,data:integration}));
      console.log('null');
    `,
          {
            projectId: project.id,
            worktreeId: project.worktreeId,
            submissionId: submission.body.id,
            unitId: randomUUID(),
            integrationId: randomUUID(),
          },
        )
      })
      await node(
        `
    import {mkdirSync,writeFileSync} from 'node:fs';
    const {projectId,worktreeId}=JSON.parse(process.argv[1]);
    const directory='/tmp/redpact-e2e-state/playwright-runs';
    mkdirSync(directory,{recursive:true});
    const record={version:1,id:'7cb7f8c8-1fcb-4567-a982-7cb2ba250172',target:'project-tests',purpose:'functional',scope:'project',worktreeId,projectId,projectRoot:'/app',revision:null,
      settings:{directory:'ui-tests',targets:{'project-tests':{purpose:'functional',testMatch:['project/tests/**/*.ts']}},service:'app',port:54320,viewport:{width:1280,height:900}},
      selection:{services:['app'],select:{}},settingsDigest:'fixture',sourceDigest:'fixture',appDigest:'fixture',createdAt:new Date().toISOString(),state:'finished',outcome:'failed',
      before:{state:'unavailable',cases:[]},after:{state:'finished',cases:[{id:'readable',file:'project/tests/result-row.spec.ts',title:'긴 실행 결과 제목은 화면 너비에 맞게 자연스럽게 여러 줄로 읽을 수 있어야 합니다',status:'failed',duration:125,errors:['요청한 값과 저장된 값이 일치하지 않습니다'],steps:[{title:'설정 저장 후 결과를 확인한다',duration:125,error:'저장된 값 불일치'}],artifacts:[]}]}};
    writeFileSync(directory+'/7cb7f8c8-1fcb-4567-a982-7cb2ba250172.json',JSON.stringify(record));
    console.log('null');
  `,
        { projectId: project.id, worktreeId: project.worktreeId },
      )
      // 영어 UI에서 의미 정보의 줄바꿈과 동작을 검증한다.
      await page.addInitScript((id) => {
        localStorage.setItem("redpact:language", "en")
        localStorage.setItem("redpact:project", id)
      }, project.id)
      await test.step("Unit 결과에서 단계와 원인을 함께 확인한다", async () => {
        await page.goto("/")
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
          origin: new URL(page.url()).origin,
        })
        if ((page.viewportSize()?.width ?? 1920) < 768) {
          await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
        }
        await page.getByRole("button", { name: "Tests", exact: true }).click()
        await page.keyboard.press("Escape")
        await page.getByRole("tab", { name: "Unit", exact: true }).click()
        await page.getByRole("tab", { name: "Command results", exact: true }).click()
        const panel = page.getByRole("region", { name: "Unit Test", exact: true })
        await expect(panel.getByRole("status", { name: "Unit progress" })).toContainText("Finished")
        await expect(panel.getByText("Docker unavailable", { exact: true })).toBeVisible()
        await expect(panel.getByRole("heading", { name: "stdout", exact: true })).toBeVisible()
        await expect(panel.getByRole("region", { name: "stdout", exact: true })).toContainText(
          "두 번째 출력",
        )
        await expect(panel.getByText("Exit code: 1", { exact: true })).toBeVisible()
        if (capture) {
          await testInfo.attach(`Results / Unit / ${width}`, {
            body: await page.screenshot(),
            contentType: "image/png",
          })
        }
      })
      await test.step("Integration 결과에서도 같은 진행 상태 형식을 확인한다", async () => {
        await page.getByRole("tab", { name: "Integration", exact: true }).click()
        const panel = page.getByRole("region", { name: "Integration Test", exact: true })
        await panel.getByRole("treeitem", { name: "progress.test.ts", exact: true }).click()
        await panel.getByRole("tab", { name: "Execution results", exact: true }).first().click()
        await expect(panel.getByRole("status", { name: "Integration progress" })).toContainText(
          "Finished",
        )
        await expect(panel.getByText("Docker unavailable", { exact: true })).toBeVisible()
        if (capture) {
          await testInfo.attach(`Results / Integration / ${width}`, {
            body: await page.screenshot(),
            contentType: "image/png",
          })
        }
      })
      await test.step("Playwright 결과의 긴 제목과 단계 진단을 확인한다", async () => {
        await page.getByRole("tab", { name: "Playwright", exact: true }).click()
        await page.getByRole("tab", { name: "Runs", exact: true }).click()
        await expect(
          page.getByRole("heading", {
            name: "긴 실행 결과 제목은 화면 너비에 맞게 자연스럽게 여러 줄로 읽을 수 있어야 합니다",
          }),
        ).toBeVisible()
        await expect(page.getByText("저장된 값 불일치", { exact: true })).toBeVisible()
        if (capture) {
          await testInfo.attach(`Results / Playwright / ${width}`, {
            body: await page.screenshot(),
            contentType: "image/png",
          })
        }
      })
      await test.step("워크트리 로그에서 실행 의도와 복사 동작을 확인한다", async () => {
        if (width < 768) {
          await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
        }
        await page
          .getByRole("navigation", { name: "Worktrees", exact: true })
          .getByRole("button")
          .first()
          .click()
        await page.keyboard.press("Escape")
        await page.getByRole("tab", { name: "Log", exact: true }).click()
        const logs = page.getByRole("region", { name: "Execution logs", exact: true })
        await expect(logs.getByRole("button", { name: /Copy log:/ }).first()).toBeVisible()
        await logs
          .getByRole("button", { name: /Copy log:/ })
          .first()
          .click()
        await expect(logs.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
        if (capture) {
          await testInfo.attach(`Results / Log / ${width}`, {
            body: await page.screenshot(),
            contentType: "image/png",
          })
        }
      })
    })
  }
}
