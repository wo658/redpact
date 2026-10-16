import { expect, test } from "@playwright/test"
import { http, node } from "../target"

test("프로젝트 설정의 긴 timeout 저장 상태를 기록한다", async ({ page }, info) => {
  const root = await node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/timeout-ui-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json','{}');console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.body.id)
  await page.goto("/")
  const settings = page.getByRole("button", { name: "Project settings", exact: true })
  await test.step("프로젝트 설정의 timeout 입력을 연다", async () => {
    if (!(await settings.isVisible())) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await settings.click()
    if ((page.viewportSize()?.width ?? 1920) < 768) {
      await page.keyboard.press("Escape")
    }
  })
  await test.step("3분 값을 저장하고 공개 API의 원본 설정과 대조한다", async () => {
    await page.locator('input[name="tests.timeoutMs"]').fill("180000")
    await page.getByRole("button", { name: "Save settings", exact: true }).click()
    await expect
      .poll(async () => {
        const current = await http<{ source: string }>(
          `/api/projects/${project.body.id}/configuration`,
        )
        return JSON.parse(current.body.source).tests?.timeoutMs
      })
      .toBe(180000)
  })
  await test.step("다시 읽은 화면에도 3분 값이 유지된다", async () => {
    await page.reload()
    await expect(page.locator('input[name="tests.timeoutMs"]')).toHaveValue("180000")
  })
  await page.locator('input[name="tests.timeoutMs"]').scrollIntoViewIfNeeded()
  await page.evaluate(() => document.fonts.ready)
  await info.attach("프로젝트 설정 / Integration / 3분 제한 저장", {
    body: await page.screenshot({ animations: "disabled", scale: "css" }),
    contentType: "image/png",
  })
})
