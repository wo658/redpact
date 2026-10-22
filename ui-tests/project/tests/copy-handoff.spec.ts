import { expect, test } from "@playwright/test"
import { isOnScreen } from "../app"
import { node } from "../target"

// 격리된 테스트 앱 origin에서 실제 Clipboard와 Web Crypto API를 검증한다.
test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test("충돌 가능한 워크트리에서도 Git 쓰기 UI 없이 diff만 탐색한다", async ({ page, request }) => {
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
  const navigation = page.getByRole("navigation", { name: "Worktrees", exact: true })
  if (!(await isOnScreen(navigation))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  const mutations: string[] = []
  page.on("request", (value) => {
    if (value.method() === "POST" && /\/git\/|\/merge/.test(value.url())) {
      mutations.push(value.url())
    }
  })
  await navigation.getByRole("button", { name: "feature", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tab", { name: "Diff", exact: true })).toBeVisible()
  await expect(page.getByRole("treeitem", { name: "file.txt", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /Merge|Uncommitted|Pull request/ })).toHaveCount(0)
  expect(mutations, "탐색은 Git 변경 요청을 만들지 않는다").toEqual([])
})
