import { expect, test } from "@playwright/test"
import { node } from "../target"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("머지 충돌에서 해결 요청을 확인하고 복사한다", async ({ page, request }) => {
  const fixtureRoot = await node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/redpact-copy-handoff-');
    const git=(cwd,...args)=>execFileSync('git',['-C',cwd,'-c','core.hooksPath=/dev/null',...args]);
    git(root,'init','-qb','main');
    git(root,'config','user.name','Test');git(root,'config','user.email','test@example.com');
    writeFileSync(root+'/.gitignore','.redpact/\\n');
    writeFileSync(root+'/file.txt','base\\n');git(root,'add','.');git(root,'commit','-qm','base');
    git(root,'worktree','add','-qb','feature',root+'-feature');
    writeFileSync(root+'/file.txt','main\\n');git(root,'commit','-qam','main change');
    writeFileSync(root+'-feature/file.txt','feature\\n');git(root+'-feature','commit','-qam','feature change');
    console.log(JSON.stringify(root));
  `)
  const connected = await request.post("/api/projects", {
    data: { path: fixtureRoot, name: "Copy handoff fixture" },
  })
  expect(connected.ok(), "생성한 Git 충돌 fixture를 연결한다").toBeTruthy()
  const project = await connected.json()
  await test.step("충돌 fixture의 main branch와 feature worktree를 연결한다", async () => {
    expect(
      (
        await request.post(`/api/projects/${project.id}/tracking`, {
          data: { mainBranch: "main", hideMerged: false, showBranches: false },
        })
      ).ok(),
    ).toBeTruthy()
    expect(
      (
        await request.post(`/api/projects/${project.id}/worktrees`, {
          data: { path: `${fixtureRoot}-feature` },
        })
      ).ok(),
    ).toBeTruthy()
  })
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  await page.goto("/")
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  })
  await test.step("feature worktree에서 Merge를 실행해 충돌 결과를 연다", async () => {
    await page.getByText("feature", { exact: true }).first().click()
    await page.getByRole("button", { name: "Merge", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Resolve merge issue" })).toBeVisible()
  })
  await test.step("공통 복사 shell이 본문과 상세 Git 출력을 유지한다", async () => {
    await expect(page.locator("pre").filter({ hasText: "Resolve Redpact merge" })).toBeVisible()
    await page.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Git output", exact: true }).click()
    await expect(page.locator('[data-slot="collapsible-content"] pre')).toContainText(
      "Auto-merging file.txt",
    )
  })
})
