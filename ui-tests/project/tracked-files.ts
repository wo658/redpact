import { type APIRequestContext, expect, type Page } from "@playwright/test"
import { openApp } from "./app"
import { node } from "./target"

export const trackedFilterLabel = "Git 추적 파일만 표시"
export const emptyTrackedLabel = "표시할 Git 추적 파일이 없습니다."

export async function prepareTrackedFiles(
  page: Page,
  request: APIRequestContext,
  empty: boolean | "nonGit" = false,
) {
  const path = await node<string>(
    `
    const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = await import('node:fs');
    const {execFileSync} = await import('node:child_process');
    const path = mkdtempSync('/tmp/tracked-files-');
    const git = (...args) => execFileSync('git', ['-C', path, ...args]);
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    mkdirSync(path+'/src'); mkdirSync(path+'/scratch');
    writeFileSync(path+'/.gitignore', 'ignored.txt\\n');
    writeFileSync(path+'/src/tracked.ts', 'export const tracked = "original";\\n');
    if (!JSON.parse(process.argv[1])) {
      git('add', '.'); git('commit', '-qm', 'Tracked fixture');
      writeFileSync(path+'/src/tracked.ts', 'export const tracked = "modified working content";\\n');
      writeFileSync(path+'/staged.ts', 'export const staged = "new staged content";\\n');
      git('add', 'staged.ts');
    }
    writeFileSync(path+'/untracked.txt', 'untracked preview content\\n');
    writeFileSync(path+'/ignored.txt', 'ignored preview content\\n');
    writeFileSync(path+'/scratch/local.txt', 'untracked directory content\\n');
    if (JSON.parse(process.argv[1]) === 'nonGit') { rmSync(path+'/.git', {recursive:true}); }
    console.log(JSON.stringify(path));
  `,
    empty,
  )
  const response = await request.post("/api/projects", {
    data: { path, name: "Tracked files fixture" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id) => localStorage.setItem("redpact:project", id), project.id)
  await openApp(page)
  await openTrackedFiles(page)
  return path
}

async function openNavigation(page: Page, name: "File Viewer" | "Settings") {
  const navigation = page.getByRole("button", { name, exact: true })
  const toggle = page.getByRole("button", { name: "사이드바 전환", exact: true })
  const mobile = (page.viewportSize()?.width ?? 1920) < 768
  if (mobile) {
    if (!(await page.locator('[data-slot="sidebar"][data-mobile="true"]').isVisible())) {
      await expect(toggle).toBeVisible()
      await toggle.click()
    }
  } else {
    const sidebar = page.locator('[data-slot="sidebar"][data-state]').first()
    await expect(sidebar).toBeAttached()
    if ((await sidebar.getAttribute("data-state")) === "collapsed") {
      await toggle.click()
    }
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
  }
  await expect(navigation).toBeInViewport()
  await navigation.click()
  await page.keyboard.press("Escape")
  if (mobile) {
    await expect(page.locator('[data-slot="sidebar"][data-mobile="true"]')).toBeHidden()
  }
}

export async function openTrackedFiles(page: Page) {
  await openNavigation(page, "File Viewer")
  await expect(page.getByRole("checkbox", { name: trackedFilterLabel, exact: true })).toHaveCount(0)
  await expect(page.getByRole("switch", { name: trackedFilterLabel, exact: true })).toHaveCount(0)
}

export async function openTrackedSettings(page: Page) {
  await openNavigation(page, "Settings")
  const toggle = page.getByRole("switch", { name: trackedFilterLabel, exact: true })
  await expect(toggle).toBeVisible()
  return toggle
}

export async function setTrackedOnly(page: Page, enabled: boolean) {
  const toggle = await openTrackedSettings(page)
  if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) {
    await toggle.click()
  }
  await expect(toggle).toHaveAttribute("aria-checked", String(enabled))
  await openTrackedFiles(page)
}

export async function changeTracking(path: string, action: "add" | "remove" | "break" | "restore") {
  await node(
    `
    const {path, action} = JSON.parse(process.argv[1]);
    const {execFileSync} = await import('node:child_process');
    const {renameSync, writeFileSync, unlinkSync} = await import('node:fs');
    if (action === 'break') {
      renameSync(path+'/.git/index', path+'/.git/index-backup');
      writeFileSync(path+'/.git/index', 'invalid Git index');
    } else if (action === 'restore') {
      unlinkSync(path+'/.git/index');
      renameSync(path+'/.git/index-backup', path+'/.git/index');
    } else {
      execFileSync('git', ['-C', path, ...(action === 'add' ? ['add', 'untracked.txt'] : ['rm', '--cached', 'untracked.txt'])]);
    }
    console.log('null');
  `,
    { path, action },
  )
}
