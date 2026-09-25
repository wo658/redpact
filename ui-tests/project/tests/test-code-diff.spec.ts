import { expect, test } from "@playwright/test"
import { http, node } from "../target"

test("테스트 코드는 전체 코드 전환 없이 변경 구간만 보여준다", async ({ page }) => {
  test.setTimeout(60000)
  const step = test.step
  const root = await step("변경과 추가된 테스트가 있는 Git 프로젝트를 준비한다", () =>
    node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/test-code-diff-');
    const git=(...args)=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null',...args]);
    git('init','-qb','main');git('config','user.name','Test');git('config','user.email','test@example.com');
    mkdirSync(root+'/.redpact');mkdirSync(root+'/acceptance');
    writeFileSync(root+'/unit.Dockerfile','FROM node:24');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{directory:'acceptance'},unitTests:{dockerfile:'unit.Dockerfile',command:'node --version',patterns:['*.test.ts']}}));
    writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));
    const lines=['// UNCHANGED_HEADER',...Array.from({length:20},(_,i)=>'// context '+i),'// OLD_ASSERTION',...Array.from({length:20},(_,i)=>'// tail '+i)];
    for(const file of ['unit.test.ts','acceptance/api.test.ts'])writeFileSync(root+'/'+file,lines.join('\\n')+'\\n');
    git('add','.');git('commit','-qm','baseline');git('checkout','-qb','feature');
    lines[21]='// NEW_ASSERTION';
    for(const file of ['unit.test.ts','acceptance/api.test.ts'])writeFileSync(root+'/'+file,lines.join('\\n')+'\\n');
    git('add','.');git('commit','-qm','changed tests');
    writeFileSync(root+'/new.test.ts','// NEW_FILE\\n');
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("실제 앱에 프로젝트를 연결한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(response.status).toBe(201)
    return response.body
  })
  await step("실제 브라우저에서 변경 구간만 표시하는지 확인한다", async () => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:language", "en")
      localStorage.setItem("redpact:project", id)
    }, project.id)
    await page.goto("/")
    await page
      .getByRole("navigation", { name: "Worktrees", exact: true })
      .getByRole("button")
      .first()
      .click()
    for (const tab of ["Unit Test", "Integration Test"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click()
      const panel = page.getByRole("region", { name: tab, exact: true })
      const file = tab === "Unit Test" ? "unit.test.ts" : "api.test.ts"
      await panel.getByRole("treeitem", { name: file, exact: true }).click()
      await test.step(`${tab} 변경된 줄과 주변 문맥만 표시한다`, async () => {
        await expect(
          panel.locator(".diff-code-insert").filter({ hasText: "NEW_ASSERTION" }),
        ).toBeVisible()
        await expect(
          panel.locator(".diff-code-delete").filter({ hasText: "OLD_ASSERTION" }),
        ).toBeVisible()
        await expect(
          panel.locator(".diff-code").filter({ hasText: "UNCHANGED_HEADER" }),
        ).toHaveCount(0)
      })
      await expect(panel.getByRole("tab", { name: "Full code", exact: true })).toHaveCount(0)
      await expect(panel.getByRole("tab", { name: "Changes", exact: true })).toHaveCount(0)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const mobilePanel = page.getByRole("region", { name: "Integration Test", exact: true })
    await expect(
      mobilePanel.locator(".diff-code-insert").filter({ hasText: "NEW_ASSERTION" }),
    ).toBeVisible()
    await expect(
      mobilePanel.locator(".diff-code").filter({ hasText: "UNCHANGED_HEADER" }),
    ).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
