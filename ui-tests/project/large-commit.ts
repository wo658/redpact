import { type APIRequestContext, expect, type Page } from "@playwright/test"
import { isOnScreen } from "./app"
import { node } from "./target"

export const sizeNotice =
  "Patch exceeds the 4 MiB display limit. Only changed file paths are shown."

export const metadataNotice =
  "Patch and file list exceed their 4 MiB display limits. Only commit metadata is shown."

export async function openLargeCommit(
  page: Page,
  request: APIRequestContext,
  metadataOnly = false,
) {
  const path = await node<string>(
    `
    const {mkdtempSync, writeFileSync} = await import('node:fs');
    const {execFileSync} = await import('node:child_process');
    const path = mkdtempSync('/tmp/large-commit-');
    const git = (...args) => execFileSync('git', ['-C', path, ...args]);
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    writeFileSync(path+'/small.txt', 'small change\\n');
    git('add', '.'); git('commit', '-qm', 'Small commit');
    writeFileSync(path+'/large.txt', 'large changed line\\n'.repeat(260000));
    writeFileSync(path+'/tail.txt', 'last file\\n');
    git('add', '.'); git('commit', '-qm', 'Large commit');
    if (JSON.parse(process.argv[1])) {
      const blob = execFileSync('git', ['-C', path, 'hash-object', '-w', '--stdin'], {input:'content', encoding:'utf8'}).trim();
      const entries = Array.from({length:18000}, (_,i) => '100644 blob '+blob+'\\t'+String(i).padStart(5,'0')+'-'+ 'x'.repeat(240)+'.txt\\n').join('');
      const tree = execFileSync('git', ['-C', path, 'mktree'], {input:entries, encoding:'utf8'}).trim();
      const commit = git('commit-tree', tree, '-p', git('rev-parse', 'HEAD').toString().trim(), '-m', 'Metadata only').toString().trim();
      git('update-ref', 'refs/heads/main', commit);
    }
    console.log(JSON.stringify(path));
  `,
    metadataOnly,
  )
  const response = await request.post("/api/projects", {
    data: { path, name: "Large diff fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  await page.goto("/")
  const navigation = page.getByRole("button", { name: "Git Graph", exact: true })
  if (!(await isOnScreen(navigation))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await expect(navigation).toBeInViewport()
  await navigation.click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
  const graph = page.locator("web-git-graph")
  await expect(graph).toHaveAttribute("aria-busy", "false")
  const diffResponse = page.waitForResponse(
    (response) => response.url().includes("/git/commits/") && response.url().endsWith("/diff"),
  )
  await graph.getByText(metadataOnly ? "Metadata only" : "Large commit", { exact: true }).click()
  const diff = await diffResponse
  expect(diff.status()).toBe(200)
  expect(await diff.json()).toMatchObject({
    available: true,
    patch: "",
    patchOmitted: "size_limit",
    ...(metadataOnly
      ? { changedPathsOmitted: "size_limit" }
      : { changedPaths: ["large.txt", "tail.txt"] }),
    omitted: [metadataOnly ? metadataNotice : sizeNotice],
  })
  await expect(page.locator('main [role="alert"]')).toHaveCount(0)
  const notice = page.locator('[data-slot="toast"]').filter({ hasText: "Problem recorded" })
  await expect(notice).toBeVisible()
  await notice.getByText("Problem recorded", { exact: true }).click()
  await expect(notice).toHaveCount(0)
  const settings = page.getByRole("button", { name: "Settings", exact: true })
  if (!(await isOnScreen(settings))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await settings.click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
  const problems = page.getByRole("region", { name: /^Problems \(/ })
  await expect(
    problems.getByText(metadataOnly ? metadataNotice : sizeNotice, { exact: true }),
  ).toBeVisible()
  // 진단을 확인한 뒤 원래 커밋 내용을 다시 탐색한다.
  if (!(await isOnScreen(navigation))) {
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  }
  await navigation.click()
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.keyboard.press("Escape")
  }
  await expect(graph).toHaveAttribute("aria-busy", "false")
  await graph.getByText(metadataOnly ? "Metadata only" : "Large commit", { exact: true }).click()
  await expect(page.getByRole("region", { name: "Commit changes" })).toBeVisible()
}
