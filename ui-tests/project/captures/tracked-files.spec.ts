import { expect, test } from "@playwright/test"
import {
  emptyTrackedLabel,
  openTrackedFiles,
  openTrackedSettings,
  prepareTrackedFiles,
  setTrackedOnly,
} from "../tracked-files"

test("파일 보기의 전체 목록과 Git 추적 필터 및 선택 원문을 기록한다", async ({
  page,
  request,
}, info) => {
  await prepareTrackedFiles(page, request)
  await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await info.attach("파일 보기 / Git 추적 필터 / 전체 파일", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
  const toggle = await openTrackedSettings(page)
  await toggle.click()
  await expect(toggle).toBeChecked()
  await info.attach("설정 / Git 추적 필터 / 추적 파일만 표시 켜짐", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
  await openTrackedFiles(page)
  await expect(page.getByRole("treeitem", { name: "untracked.txt", exact: true })).toHaveCount(0)
  await page.getByRole("treeitem", { name: "src", exact: true }).click()
  await page.getByRole("treeitem", { name: "tracked.ts", exact: true }).click()
  await expect(page.locator(".diff-source")).toContainText("modified working content")
  await info.attach("파일 보기 / Git 추적 필터 / 추적 파일과 현재 원문", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})

test("파일 보기의 추적 파일 없음 상태와 필터 복구 수단을 기록한다", async ({
  page,
  request,
}, info) => {
  await prepareTrackedFiles(page, request, true)
  await setTrackedOnly(page, true)
  await expect(page.getByText(emptyTrackedLabel, { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await info.attach("파일 보기 / Git 추적 필터 / 추적 파일 없음", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
