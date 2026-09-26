import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { http, node } from "../target"

/** 저장된 Unit·Integration 실행이 실제 프로젝트 테스트 화면에서 같은 진행 상태 형식을 사용한다. */
test("Unit과 Integration 실행 기록에서 진행 상태와 오류를 함께 확인한다", async ({ page }) => {
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
        outcome:'execution_error',exitCode:null,stdout:'',stderr:'',truncated:false,error:'Docker unavailable'};
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
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "en")
    localStorage.setItem("redpact:project", id)
  }, project.id)
  await test.step("Unit 결과에서 단계와 원인을 함께 확인한다", async () => {
    await page.goto("/")
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
  })
})
