import { expect, test } from "@playwright/test"
import {
  changeTracking,
  emptyTrackedLabel,
  openTrackedFiles,
  openTrackedSettings,
  prepareTrackedFiles,
  setTrackedOnly,
} from "../tracked-files"

test("Git 추적 필터가 수정·신규 스테이징 파일을 유지하고 숨겨진 파일의 선택을 해제한다", async ({
  page,
  request,
}) => {
  await prepareTrackedFiles(page, request)
  const row = (name: string) => page.getByRole("treeitem", { name, exact: true })
  await test.step("실제 HTTP API가 필터 값과 직접 파일 조회에도 같은 추적 경계를 적용한다", async () => {
    const projectId = await page.evaluate(() => localStorage.getItem("redpact:project"))
    expect(projectId, "화면에 연결한 프로젝트 식별자가 있어야 한다").toBeTruthy()
    const endpoint = `/api/projects/${encodeURIComponent(projectId ?? "")}/files`
    const invalid = await request.get(`${endpoint}?trackedOnly=maybe`)
    expect(invalid.status(), "지원하지 않는 필터 값은 입력 오류로 거부한다").toBe(400)
    for (const path of ["untracked.txt", "ignored.txt", "scratch"]) {
      const filtered = await request.get(`${endpoint}?path=${path}&trackedOnly=true`)
      expect(filtered.status(), `${path} 직접 조회도 필터를 우회하지 못한다`).toBe(404)
      for (const query of ["", "&trackedOnly=false"]) {
        const allFiles = await request.get(`${endpoint}?path=${path}${query}`)
        expect(allFiles.status(), `${path} 전체 보기에서는 읽을 수 있다`).toBe(200)
      }
    }
    const modified = await request.get(`${endpoint}?path=src/tracked.ts&trackedOnly=true`)
    expect(modified.status()).toBe(200)
    expect(await modified.json()).toMatchObject({
      kind: "text",
      content: 'export const tracked = "modified working content";\n',
    })
  })
  await test.step("기본 전체 보기에서 무시 파일과 미추적 파일도 열 수 있다", async () => {
    await expect(await openTrackedSettings(page)).not.toBeChecked()
    await openTrackedFiles(page)
    await expect(row("scratch")).toBeVisible()
    await row("ignored.txt").click()
    await expect(page.locator(".diff-source")).toContainText("ignored preview content")
    await row("untracked.txt").click()
    await expect(page.locator(".diff-source")).toContainText("untracked preview content")
  })
  await test.step("키보드로 필터를 켜면 미추적 선택과 빈 폴더가 사라진다", async () => {
    const toggle = await openTrackedSettings(page)
    await toggle.focus()
    await page.keyboard.press("Space")
    await expect(toggle).toBeChecked()
    await openTrackedFiles(page)
    for (const name of ["ignored.txt", "untracked.txt", "scratch"]) {
      await expect(row(name)).toHaveCount(0)
    }
    await expect(page.getByText("내용을 보려면 파일을 선택하세요.", { exact: true })).toBeVisible()
    await expect(page.locator(".diff-source")).toHaveCount(0)
  })
  await test.step("수정 파일과 신규 스테이징 파일의 현재 내용을 표시하고 필터 전환 시 선택을 초기화한다", async () => {
    if ((await row("src").getAttribute("aria-expanded")) !== "true") {
      await row("src").click()
    }
    await row("tracked.ts").click()
    await expect(page.locator(".diff-source")).toContainText("modified working content")
    await setTrackedOnly(page, false)
    await expect(page.getByText("내용을 보려면 파일을 선택하세요.", { exact: true })).toBeVisible()
    await setTrackedOnly(page, true)
    await expect(page.getByText("내용을 보려면 파일을 선택하세요.", { exact: true })).toBeVisible()
    if ((await row("src").getAttribute("aria-expanded")) !== "true") {
      await row("src").click()
    }
    await row("tracked.ts").click()
    await expect(page.locator(".diff-source")).toContainText("modified working content")
    await row("staged.ts").click()
    await expect(page.locator(".diff-source")).toContainText("new staged content")
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      "화면 너비 안에 필터와 파일 내용을 유지한다",
    ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  })
  await test.step("새로고침해도 전역 설정과 추적 파일만 표시 상태를 유지한다", async () => {
    await page.reload()
    await openTrackedFiles(page)
    await expect(await openTrackedSettings(page)).toBeChecked()
    await openTrackedFiles(page)
    await expect(row("untracked.txt")).toHaveCount(0)
    await setTrackedOnly(page, false)
    await expect(row("untracked.txt")).toBeVisible()
    await page.reload()
    await expect(await openTrackedSettings(page)).not.toBeChecked()
    await openTrackedFiles(page)
    await expect(row("untracked.txt")).toBeVisible()
  })
})

test("Git 인덱스의 실시간 추가와 제거를 파일 목록과 선택에 반영한다", async ({ page, request }) => {
  const path = await prepareTrackedFiles(page, request)
  await setTrackedOnly(page, true)
  const file = page.getByRole("treeitem", { name: "untracked.txt", exact: true })
  await expect(file).toHaveCount(0)
  await test.step("git add 이후 새 추적 파일을 새로고침 없이 표시한다", async () => {
    await changeTracking(path, "add")
    await expect(file).toBeVisible({ timeout: 15000 })
    await file.click()
    await expect(page.locator(".diff-source")).toContainText("untracked preview content")
  })
  await test.step("git rm --cached 이후 파일과 이전 내용을 함께 숨긴다", async () => {
    await changeTracking(path, "remove")
    await expect(file).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByText("내용을 보려면 파일을 선택하세요.", { exact: true })).toBeVisible()
    await expect(page.locator(".diff-source")).toHaveCount(0)
  })
})

test("추적 파일이 없는 저장소는 빈 상태를 표시하고 필터 해제로 복구한다", async ({
  page,
  request,
}) => {
  await prepareTrackedFiles(page, request, true)
  await setTrackedOnly(page, true)
  await expect(page.getByText(emptyTrackedLabel, { exact: true })).toBeVisible()
  await expect(page.getByRole("treeitem")).toHaveCount(0)
  await setTrackedOnly(page, false)
  await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toBeVisible()
})

test("Git 정보를 읽지 못하면 오류를 표시하고 필터 해제와 재시도로 복구한다", async ({
  page,
  request,
}) => {
  const path = await prepareTrackedFiles(page, request)
  await changeTracking(path, "break")
  try {
    await setTrackedOnly(page, true)
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible()
    await expect(page.getByText(emptyTrackedLabel, { exact: true })).toHaveCount(0)
    await setTrackedOnly(page, false)
    await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0)
    await setTrackedOnly(page, true)
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible()
  } finally {
    await changeTracking(path, "restore")
  }
  const retry = page.getByRole("button", { name: "다시 시도", exact: true })
  if (await retry.isVisible()) {
    await retry.click()
  }
  await expect(page.getByRole("treeitem", { name: "staged.ts", exact: true })).toBeVisible()
  await expect(retry).toHaveCount(0)
})

test("Git 저장소가 아닌 폴더에서 필터 오류를 구분하고 전체 파일을 다시 표시한다", async ({
  page,
  request,
}) => {
  await prepareTrackedFiles(page, request, "nonGit")
  await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toBeVisible()
  await setTrackedOnly(page, true)
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible()
  await expect(page.getByText(emptyTrackedLabel, { exact: true })).toHaveCount(0)
  await setTrackedOnly(page, false)
  await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0)
})

test("다른 탭의 전역 설정 변경이 열린 파일 보기에 즉시 반영된다", async ({ page, request }) => {
  await prepareTrackedFiles(page, request)
  const file = page.getByRole("treeitem", { name: "untracked.txt", exact: true })
  await file.click()
  await expect(page.locator(".diff-source")).toContainText("untracked preview content")
  const settingsPage = await page.context().newPage()
  try {
    await settingsPage.goto("/")
    const toggle = await openTrackedSettings(settingsPage)
    await test.step("다른 탭에서 설정을 켜면 기존 탭의 미추적 파일과 원문을 숨긴다", async () => {
      await toggle.click()
      await expect(toggle).toBeChecked()
      await expect(file).toHaveCount(0)
      await expect(page.locator(".diff-source")).toHaveCount(0)
      await expect(
        page.getByText("내용을 보려면 파일을 선택하세요.", { exact: true }),
      ).toBeVisible()
    })
    await test.step("다른 탭에서 설정을 끄면 기존 탭에 전체 파일을 다시 표시한다", async () => {
      await toggle.click()
      await expect(toggle).not.toBeChecked()
      await expect(file).toBeVisible()
    })
  } finally {
    await settingsPage.close()
  }
})
