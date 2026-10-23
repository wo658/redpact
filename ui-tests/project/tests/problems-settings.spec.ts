import { expect, test } from "@playwright/test"
import { verifyProblems } from "../problems"

for (const width of [1920, 800]) {
  test(`${width}px에서 우하단 알림을 닫아도 Settings 진단은 유지되고 명시적으로 지울 수 있다`, async ({
    page,
    request,
  }) => {
    const response = await request.post("/api/projects", {
      data: { path: "/app", name: "Problems settings fixture" },
    })
    expect(response.ok()).toBeTruthy()
    const project = await response.json()
    await page.addInitScript(
      (id: string) => localStorage.setItem("redpact:project", id),
      project.id,
    )
    const { notice, settings, openSettings, recover } = await verifyProblems(page, expect, width)
    await test.step("알림은 우하단에 있고 헤더나 본문 진단을 추가하지 않는다", async () => {
      const bounds = await notice.boundingBox()
      expect(bounds).not.toBeNull()
      if (!bounds) {
        throw new Error("문제 알림의 화면 위치를 확인할 수 없습니다")
      }
      expect(bounds.x + bounds.width).toBeGreaterThan(width - 40)
      expect(bounds.y + bounds.height).toBeGreaterThan(850)
      await expect(
        page.locator(".app-header").getByRole("button", { name: /^Problems \(/ }),
      ).toHaveCount(0)
    })
    await test.step("알림 클릭은 진단을 지우지 않고 Settings에서 확인할 수 있다", async () => {
      await notice.getByText("Problem recorded", { exact: true }).click()
      await expect(notice).toHaveCount(0)
      await openSettings()
      await expect(settings.locator("li")).toHaveCount(1)
    })
    await test.step("목록 비우기 후 실제 파일 관찰 새로고침이 정상 복구된다", recover)
  })
}
