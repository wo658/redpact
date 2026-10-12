import { expect, test } from "@playwright/test"
import {
  assertWrapped,
  openNavigation,
  openWrapDiff,
  openWrapSource,
  prepareWrapProject,
} from "../word-wrap"

test("diff와 파일 뷰어가 앱 본문을 채우고 파일 탐색과 줄바꿈을 유지한다", async ({
  page,
  request,
}) => {
  const restore = await prepareWrapProject(page, request)
  try {
    await openWrapDiff(page)
    for (const view of ["diff", "source", "tests"]) {
      if (view === "source") {
        await openWrapSource(page)
      }
      if (view === "tests") {
        await openNavigation(page, "Tests")
        await page.getByRole("tab", { name: "Integration", exact: true }).click()
        await page.getByRole("treeitem", { name: "worktree-evidence.test.ts", exact: true }).click()
        await expect(page.locator(".diff-source")).toBeVisible()
      }
      await test.step(`${view}의 본문이 외곽 여백 없이 프레임을 채운다`, async () => {
        if (view !== "tests") {
          await assertWrapped(page)
        }
        const frame = await page.locator('[data-slot="sidebar-inset"]').boundingBox()
        const body = await page.locator(".review-layout").boundingBox()
        expect(frame).not.toBeNull()
        expect(body).not.toBeNull()
        if (!frame || !body) {
          throw new Error("뷰어 영역이 표시되어야 한다")
        }
        expect(Math.abs(body.x - frame.x), "왼쪽 여백을 없앤다").toBeLessThanOrEqual(1)
        expect(Math.abs(body.width - frame.width), "전체 너비를 사용한다").toBeLessThanOrEqual(1)
        expect(
          Math.abs(body.y + body.height - frame.y - frame.height),
          "하단까지 채운다",
        ).toBeLessThanOrEqual(1)
      })
    }
  } finally {
    await restore()
  }
})
